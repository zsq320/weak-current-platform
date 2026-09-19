// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
//
// 商用化功能专项回归：资金账本/充值订单/提现/合同签署托管/佣金质保金/
// 施工过程/BOQ/验收/聊天/纠纷/发票/企业认证/设置/备份
// 用法：先启动服务，另开终端执行 node tests/api-commercial.js

const BASE = process.env.BASE_URL || 'http://localhost:3000';
let passed = 0, failed = 0;
const failures = [];

function assert(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${extra ? ' :: ' + extra : ''}`); }
}

async function api(method, path, { token, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (raw) return res;
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}

async function login(username, password) {
  const r = await api('POST', '/api/auth/login', { body: { username, password } });
  return r.json.accessToken || r.json.access_token;
}

(async () => {
  console.log('【商用化功能回归】');
  const owner = await login('zhangsan', '123456');
  const eng = await login('engineer1', '123456');
  const admin = await login('admin', '123456');
  assert('种子账号登录', !!(owner && eng && admin));

  // ---------- 1. 资金账本与充值 ----------
  console.log('【1】资金账本');
  const before = await api('GET', '/api/finance/ledger', { token: owner });
  const deposit = await api('POST', '/api/auth/deposit', { token: owner, body: { amount: 5000 } });
  assert('充值成功并返回余额', deposit.status === 200 && typeof deposit.json.balance === 'number');
  const after = await api('GET', '/api/finance/ledger', { token: owner });
  const newest = after.json.items[0];
  assert('充值写入流水账本', newest.type === 'deposit' && newest.amount === 5000,
    JSON.stringify(newest).slice(0, 120));
  assert('流水含余额快照', typeof newest.balance_after === 'number');

  // 充值订单模式
  const order = await api('POST', '/api/finance/deposit/orders', { token: owner, body: { amount: 100 } });
  assert('创建充值订单', order.status === 201 && order.json.order.order_no.startsWith('D'));
  const confirm = await api('POST', `/api/finance/deposit/orders/${order.json.order.order_no}/confirm`, { token: owner });
  assert('mock 通道确认入账', confirm.status === 200);

  // ---------- 2. 提现：申请冻结 -> 驳回退回 ----------
  console.log('【2】提现闭环');
  const balBefore = (await api('GET', '/api/auth/me', { token: eng })).json.balance;
  const wd = await api('POST', '/api/finance/withdrawals', { token: eng, body: { amount: 100, bank_info: '6222020200112233445 测试银行 李工程' } });
  assert('提现申请成功', wd.status === 201);
  const balFrozen = (await api('GET', '/api/auth/me', { token: eng })).json.balance;
  assert('提现冻结余额', Math.abs(balFrozen - (balBefore - 100)) < 0.01, `${balFrozen} vs ${balBefore - 100}`);
  const overspend = await api('POST', '/api/finance/withdrawals', { token: eng, body: { amount: 99999999, bank_info: 'x' } });
  assert('超额提现被拒', overspend.status === 400);

  // 管理员驳回 -> 退回
  const adminWd = await api('GET', '/api/admin/withdrawals', { token: admin });
  const pendingWd = adminWd.json.items.find(w => w.status === 'pending');
  assert('管理员可见待审提现', !!pendingWd);
  const reject = await api('POST', `/api/admin/withdrawals/${pendingWd.id}/process`, { token: admin, body: { action: 'reject', reject_reason: '回归测试驳回' } });
  assert('提现驳回成功', reject.status === 200);
  const balRefund = (await api('GET', '/api/auth/me', { token: eng })).json.balance;
  assert('驳回后退回余额', Math.abs(balRefund - balBefore) < 0.01);

  // ---------- 3. 全流程：发布 -> 投标 -> 接受 -> 签署(托管) -> 完工结算 ----------
  console.log('【3】签署托管结算');
  const proj = await api('POST', '/api/projects', {
    token: owner,
    body: { title: `商用化回归工程${Date.now()}`, description: '商用化功能回归测试工程', category: '综合布线', location: '杭州市', budget: 20000, deadline: '2026-12-31' }
  });
  const projectId = proj.json.id;
  const start = await api('PUT', `/api/projects/${projectId}`, { token: owner, body: { status: 'bidding' } });
  assert('工程发布并进入招标', start.status === 200);

  const bid = await api('POST', '/api/bids', {
    token: eng, body: { project_id: projectId, price: 20000, message: '商用化回归投标，可保证工期与质量', duration: 30, duration_unit: 'days', experience_years: 5 }
  });
  assert('工程师投标成功', bid.status === 200 || bid.status === 201);
  const bids = await api('GET', `/api/bids/project/${projectId}`, { token: owner });
  const bidId = bids.json.bids ? bids.json.bids[0].id : bids.json[0]?.id;

  const accept = await api('POST', `/api/bids/${bidId}/accept`, { token: owner });
  assert('接受投标生成合同', accept.status === 200);
  const myContracts = await api('GET', '/api/contracts/my', { token: owner });
  const contract = myContracts.json.find(c => c.project_id === projectId);
  assert('合同存在且带签署字段', !!contract && contract.sign_status === 'pending' && contract.escrow_status === 'none');

  // 合同正文生成
  const detail = await api('GET', `/api/contracts/${contract.id}`, { token: owner });
  assert('合同正文自动生成', detail.status === 200 && String(detail.json.contract.content).includes('弱电工程服务合同'));
  assert('合同含内容哈希', !!detail.json.contract.content_hash);

  // 工程师签署
  const engSign = await api('POST', `/api/contracts/${contract.id}/sign`, { token: eng, body: { password: '123456' } });
  assert('乙方密码签署成功', engSign.status === 200 && engSign.json.content_hash);
  const engSignDup = await api('POST', `/api/contracts/${contract.id}/sign`, { token: eng, body: { password: '123456' } });
  assert('重复签署被拒', engSignDup.status === 400);
  const wrongPwd = await api('POST', `/api/contracts/${contract.id}/sign`, { token: owner, body: { password: 'wrong' } });
  assert('密码错误签署被拒', wrongPwd.status === 400);

  // 甲方签署并托管
  const ownerBalBefore = (await api('GET', '/api/auth/me', { token: owner })).json.balance;
  const ownerSign = await api('POST', `/api/contracts/${contract.id}/sign`, { token: owner, body: { password: '123456', escrow: true } });
  assert('甲方签署并托管成功', ownerSign.status === 200);
  assert('托管状态已冻结', (await api('GET', `/api/contracts/${contract.id}`, { token: owner })).json.contract.escrow_status === 'frozen');
  const ownerBalFrozen = (await api('GET', '/api/auth/me', { token: owner })).json.balance;
  assert('托管冻结甲方余额', Math.abs(ownerBalFrozen - (ownerBalBefore - 20000)) < 0.01);

  // 施工过程
  const log = await api('POST', `/api/projects/${projectId}/construction/logs`, { token: eng, body: { log_date: '2026-09-19', weather: '晴', workers_count: 3, content: '桥架安装' } });
  assert('施工日志记录', log.status === 201);
  const boq = await api('POST', `/api/projects/${projectId}/construction/boq`, { token: owner, body: { name: '超五类网线', unit: '箱', qty: 10, unit_price: 400 } });
  assert('BOQ清单项添加', boq.status === 201);
  const boqList = await api('GET', `/api/projects/${projectId}/construction/boq`, { token: owner });
  assert('BOQ合计正确', boqList.json.boq_total === 4000);
  const mat = await api('POST', `/api/projects/${projectId}/construction/materials`, { token: eng, body: { name: '光纤收发器', qty: 20, unit: '个', amount: 1600 } });
  assert('材料进场登记', mat.status === 201);
  const acc = await api('POST', `/api/projects/${projectId}/construction/acceptances`, { token: eng, body: { type: 'final', name: '竣工验收', content: '全部完工' } });
  assert('竣工验收申请', acc.status === 201);
  const accList = await api('GET', `/api/projects/${projectId}/construction/acceptances`, { token: owner });
  const finalAcc = accList.json.items.find(a => a.type === 'final');
  const accPass = await api('PUT', `/api/projects/${projectId}/construction/acceptances/${finalAcc.id}/review`, { token: owner, body: { status: 'approved' } });
  assert('竣工验收通过', accPass.status === 200);

  // 完工结算（已托管，不再扣款）
  const engBalBefore = (await api('GET', '/api/auth/me', { token: eng })).json.balance;
  const complete = await api('POST', `/api/contracts/${contract.id}/complete`, { token: owner });
  assert('完工结算成功', complete.status === 200, JSON.stringify(complete.json));
  assert('结算返回佣金/质保金', complete.json.commission === 1000 && complete.json.retention === 1000 && complete.json.to_engineer === 18000);
  const engBalAfter = (await api('GET', '/api/auth/me', { token: eng })).json.balance;
  assert('工程师到账18000（扣佣金质保金）', Math.abs(engBalAfter - engBalBefore - 18000) < 0.01);
  const cDetail = await api('GET', `/api/contracts/${contract.id}`, { token: owner });
  assert('合同托管状态为已结算', cDetail.json.contract.escrow_status === 'settled');

  // 质保金列表
  const retentions = await api('GET', '/api/finance/retentions', { token: eng });
  assert('质保金出现在留存列表', retentions.json.items.some(r => r.id === contract.id));

  // ---------- 4. 聊天 / 纠纷 / 发票 / 企业认证 ----------
  console.log('【4】沟通与运营');
  const chat = await api('POST', `/api/biz/projects/${projectId}/chat`, { token: owner, body: { content: '您好，请按时进场' } });
  assert('聊天发送成功', chat.status === 201);
  const chatEng = await api('GET', `/api/biz/projects/${projectId}/chat`, { token: eng });
  assert('对方收到消息', chatEng.json.items.some(m => m.content === '您好，请按时进场'));

  const dispute = await api('POST', '/api/biz/disputes', { token: eng, body: { contract_id: contract.id, reason: '回归测试纠纷', description: '测试仲裁流程' } });
  assert('纠纷提交', dispute.status === 201);
  const adminDisputes = await api('GET', '/api/biz/disputes', { token: admin });
  const openDispute = adminDisputes.json.items.find(d => d.status === 'open');
  const arbitrate = await api('POST', `/api/admin/disputes/${openDispute.id}/arbitrate`, { token: admin, body: { resolution: '双方协商解决，回归测试办结' } });
  assert('管理员仲裁办结', arbitrate.status === 200);

  const invoice = await api('POST', '/api/biz/invoices', { token: eng, body: { contract_id: contract.id, title_type: 'company', title: '测试科技有限公司', tax_no: '91330100MA27X8Y9HH', amount: 5000, invoice_type: 'normal' } });
  assert('发票申请成功', invoice.status === 201);
  const invProcess = await api('POST', `/api/admin/invoices/${invoice.json.id}/process`, { token: admin, body: { action: 'approve' } });
  assert('发票审核通过', invProcess.status === 200);

  const me = await api('GET', '/api/auth/me', { token: eng });
  const companyGet = await api('GET', '/api/biz/company', { token: eng });
  if (!companyGet.json.company || ['none', 'rejected'].includes(companyGet.json.company.status)) {
    const company = await api('POST', '/api/biz/company', { token: eng, body: { company_name: '测试施工单位有限公司', license_no: '91330100MA27X8Y9HH', qualification_level: '电子与智能化工程专业承包二级' } });
    assert('企业认证提交', company.status === 201, JSON.stringify(company.json).slice(0, 120));
  } else {
    assert('企业认证提交', true, '已认证过，跳过');
  }
  const companiesList = await api('GET', '/api/admin/companies', { token: admin });
  const myCompany = companiesList.json.items.find(c => c.user_id === me.json.id);
  if (myCompany && myCompany.status === 'pending') {
    const companyApprove = await api('POST', `/api/admin/companies/${myCompany.user_id}/review`, { token: admin, body: { action: 'approve' } });
    assert('企业认证审核', companyApprove.status === 200);
  } else {
    assert('企业认证审核', !!myCompany && myCompany.status === 'approved');
  }

  // ---------- 5. 设置 / 对账 / 备份 ----------
  console.log('【5】平台运营');
  const settings = await api('GET', '/api/admin/settings', { token: admin });
  assert('读取平台设置', settings.status === 200 && settings.json.items.some(s => s.key === 'commission_rate'));
  const badSetting = await api('PUT', '/api/admin/settings', { token: admin, body: { settings: { commission_rate: 500 } } });
  assert('非法设置被拒', badSetting.status === 400);
  const csv = await fetch(BASE + '/api/admin/reports/ledger.csv', { headers: { Authorization: `Bearer ${admin}` } });
  const csvText = await csv.text();
  assert('对账CSV导出', csv.status === 200 && csvText.includes('balance_after') && csvText.includes('deposit'));
  const backup = await api('POST', '/api/admin/backups', { token: admin });
  assert('数据库备份', backup.status === 200, JSON.stringify(backup.json));
  const backups = await api('GET', '/api/admin/backups', { token: admin });
  assert('备份列表', backups.json.items.length > 0);

  const platformIncome = await api('GET', '/api/finance/platform-income', { token: admin });
  const commissionRow = platformIncome.json.items.find(r => r.type === 'commission');
  assert('平台佣金入账汇总', !!commissionRow && commissionRow.total > 0);

  // ---------- 6. 协议 ----------
  console.log('【6】法律文件');
  const agreement = await api('GET', '/api/biz/agreements/user_agreement');
  assert('用户协议可获取', agreement.status === 200 && agreement.json.content.includes('用户服务协议'));
  const acceptAg = await api('POST', '/api/biz/agreements/privacy/accept', { token: owner });
  assert('协议接受记录', acceptAg.status === 200);

  // 汇总
  console.log('\n==============================================');
  console.log(` 测试结果：通过 ${passed} 项，失败 ${failed} 项`);
  if (failures.length) { console.log(' 失败清单：'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('==============================================');
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => { console.error('测试执行异常:', err); process.exit(1); });
