// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// 全场景 API 回归测试：覆盖认证、权限、投标、评分、合同、任务、里程碑、消息、管理后台与安全整改点
// 用法：先启动服务（npm start），再执行 node tests/api-fulltest.js
// 说明：主流程基于种子账号（zhangsan/engineer1，密码 123456），对已完成的实名认证等状态做了容错，可重复执行。

const BASE = process.env.BASE_URL || process.env.TEST_BASE_URL || 'http://localhost:3000';
const db = require('../server/db');

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ' :: ' + detail : ''}`);
    console.log(`  ✗ ${name}${detail ? ' :: ' + detail : ''}`);
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch (e) { json = { _raw: text }; }
  return { status: res.status, json };
}

function latestCode(target, type) {
  const row = db.prepare(
    "SELECT code FROM verification_codes WHERE target = ? AND type = ? AND purpose = 'register' AND used = 0 ORDER BY created_at DESC LIMIT 1"
  ).get(target, type);
  return row ? row.code : null;
}

async function main() {
  console.log('==============================================');
  console.log(' 弱电工程管理平台 · 全场景 API 回归测试');
  console.log('==============================================\n');

  // ---------- 1. 基础可用性 ----------
  console.log('【1】基础可用性');
  const health = await api('GET', '/api/health');
  assert('健康检查可用', health.status === 200 && health.json.status === 'ok');
  const index = await fetch(BASE + '/');
  assert('前端首页可访问', index.status === 200 && (await index.text()).includes('弱电工程管理平台'));

  // ---------- 2. 认证 ----------
  console.log('【2】认证模块');
  const adminLogin = await api('POST', '/api/auth/login', { body: { username: 'admin', password: '123456' } });
  assert('管理员登录（对齐 README 默认账号）', adminLogin.status === 200 && adminLogin.json.accessToken, JSON.stringify(adminLogin.json).slice(0, 120));
  const admin = adminLogin.json.accessToken;

  const ownerLogin = await api('POST', '/api/auth/login', { body: { username: 'zhangsan', password: '123456' } });
  assert('甲方登录', ownerLogin.status === 200 && ownerLogin.json.accessToken);
  const owner = ownerLogin.json.accessToken;

  const engLogin = await api('POST', '/api/auth/login', { body: { username: 'engineer1', password: '123456' } });
  assert('工程师登录', engLogin.status === 200 && engLogin.json.accessToken);
  const eng = engLogin.json.accessToken;

  const badLogin = await api('POST', '/api/auth/login', { body: { username: 'zhangsan', password: 'wrong' } });
  assert('错误密码被拒绝', badLogin.status === 401);

  const me = await api('GET', '/api/auth/me', { token: owner });
  assert('获取个人信息（手机号脱敏）', me.status === 200 && (!me.json.phone || me.json.phone.includes('*')));

  const noToken = await api('GET', '/api/auth/me');
  assert('无令牌访问受保护接口被拒', noToken.status === 401);

  // ---------- 3. 信息泄露整改验证 ----------
  console.log('【3】信息泄露整改验证（未登录/无权限视角）');
  const projList = await api('GET', '/api/projects');
  assert('未登录可浏览工程列表', projList.status === 200 && Array.isArray(projList.json.data) && projList.json.data.length > 0);
  const someProject = projList.json.data[0];

  const anonDetail = await api('GET', `/api/projects/${someProject.id}`);
  assert('未登录工程详情不含投标列表', anonDetail.status === 200 && anonDetail.json.bids === undefined);
  assert('未登录工程详情发布者电话脱敏', !anonDetail.json.publisher_phone || String(anonDetail.json.publisher_phone).includes('*'));

  const anonBids = await api('GET', `/api/bids/project/${someProject.id}`);
  assert('未登录不可获取工程投标列表', anonBids.status === 401 || anonBids.status === 403);

  const anonBidDetail = await api('GET', '/api/bids/1');
  assert('未登录不可获取投标详情', anonBidDetail.status === 401);

  const anonRank = await api('GET', `/api/bids/project/${someProject.id}/rankings`);
  assert('未登录不可获取评分排名', anonRank.status === 401 || anonRank.status === 403);

  const anonTasks = await api('GET', `/api/projects/${someProject.id}/tasks`);
  assert('未登录不可获取项目任务', anonTasks.status === 401);

  if (someProject.user_id !== 3) {
    const engOtherBids = await api('GET', `/api/bids/project/${someProject.id}`, { token: eng });
    assert('非发布者工程师不可获取他人工程投标列表', engOtherBids.status === 403);
  }

  // ---------- 4. 实名认证与投标门槛 ----------
  console.log('【4】实名认证与投标门槛');
  const verify = await api('POST', '/api/auth/verify-identity', {
    token: eng,
    body: { real_name: '李工程', id_card: '110101199001011237' }
  });
  assert('实名认证提交成功（或已完成）', verify.status === 200 || (verify.status === 400 && String(verify.json.error || '').includes('已完成')),
    JSON.stringify(verify.json).slice(0, 120));

  const badIdCard = await api('POST', '/api/auth/verify-identity', {
    token: admin,
    body: { real_name: 'x', id_card: '123' }
  });
  assert('非法身份证号被拒绝', badIdCard.status === 400);

  // ---------- 5. 发布工程 ----------
  console.log('【5】发布工程');
  const publish = await api('POST', '/api/projects', {
    token: owner,
    body: {
      title: `回归测试-办公楼综合布线工程${Date.now() % 10000}`,
      description: '全场景回归测试用工程：包含水平布线、垂直干线与机房整理。',
      category: '综合布线',
      location: '杭州市滨江区',
      budget: 120000,
      deadline: '2026-12-31'
    }
  });
  assert('实名甲方发布工程成功', publish.status === 200 && publish.json.id, JSON.stringify(publish.json).slice(0, 120));
  const projectId = publish.json.id;

  const engPublish = await api('POST', '/api/projects', {
    token: eng,
    body: { title: '工程师发布测试', category: '其他' }
  });
  assert('工程师角色不可发布工程', engPublish.status === 403);

  const badProject = await api('POST', '/api/projects', {
    token: owner,
    body: { title: '', category: '其他' }
  });
  assert('空标题发布被拒绝', badProject.status === 400);

  // ---------- 6. 投标与评分 ----------
  console.log('【6】投标与评分');
  const bid = await api('POST', '/api/bids', {
    token: eng,
    body: {
      project_id: projectId,
      price: 88000,
      duration: 60,
      duration_unit: 'days',
      experience_years: 6,
      message: '拥有10年综合布线实施经验，方案详见附件说明，可保证工期与质量。'
    }
  });
  assert('实名工程师投标成功', bid.status === 200 && bid.json.id, JSON.stringify(bid.json).slice(0, 120));
  const bidId = bid.json.id;

  const dupBid = await api('POST', '/api/bids', {
    token: eng,
    body: { project_id: projectId, price: 100, message: '重复投标测试' }
  });
  assert('重复投标被拒绝', dupBid.status === 400);

  const myBids = await api('GET', '/api/bids/my', { token: eng });
  assert('我的投标列表可用（路由顺序修复）', myBids.status === 200 && Array.isArray(myBids.json) && myBids.json.some(b => b.id === bidId));

  const ownerDetail = await api('GET', `/api/projects/${projectId}`, { token: owner });
  assert('发布者可见投标列表', ownerDetail.status === 200 && Array.isArray(ownerDetail.json.bids) && ownerDetail.json.bids.length === 1);

  const engDetail = await api('GET', `/api/projects/${projectId}`, { token: eng });
  assert('投标工程师不可见他人投标列表且标记 has_bid', engDetail.status === 200 && engDetail.json.bids === undefined && engDetail.json.has_bid === true);

  const ownerBidList = await api('GET', `/api/bids/project/${projectId}`, { token: owner });
  assert('发布者可获取投标列表（含评分字段）', ownerBidList.status === 200 && ownerBidList.json.bids.length === 1);

  const score = await api('POST', `/api/bids/${bidId}/score`, {
    token: owner,
    body: { price_score: 20, duration_score: 15, qualification_score: 18, technical_score: 22, price_comment: '报价合理' }
  });
  assert('发布者评分成功（总分75）', score.status === 200 && score.json.total_score === 75, JSON.stringify(score.json).slice(0, 120));

  const badScore = await api('POST', `/api/bids/${bidId}/score`, {
    token: owner,
    body: { price_score: 99, duration_score: 15, qualification_score: 18, technical_score: 22 }
  });
  assert('越界评分被拒绝', badScore.status === 400);

  const strScore = await api('POST', `/api/bids/${bidId}/score`, {
    token: owner,
    body: { price_score: 'abc', duration_score: 15, qualification_score: 18, technical_score: 22 }
  });
  assert('非数字评分被拒绝', strScore.status === 400);

  const exportCsv = await fetch(`${BASE}/api/bids/project/${projectId}/export`, { headers: { Authorization: `Bearer ${owner}` } });
  const csvText = await exportCsv.text();
  assert('评分表 CSV 导出成功', exportCsv.status === 200 && exportCsv.headers.get('content-type').includes('text/csv') && csvText.includes('工程师账号'));

  // ---------- 7. 状态机与业务约束 ----------
  console.log('【7】状态机与业务约束');
  const earlyStart = await api('PUT', `/api/projects/${projectId}`, { token: owner, body: { status: 'in_progress' } });
  assert('存在待定投标时不可直接开始工程', earlyStart.status === 400);

  const fieldOnlyUpdate = await api('PUT', `/api/projects/${projectId}`, { token: owner, body: { title: `回归测试-办公楼综合布线工程（更新）${Date.now() % 10000}` } });
  assert('仅更新标题不再触发 500（undefined 绑定修复）', fieldOnlyUpdate.status === 200, JSON.stringify(fieldOnlyUpdate.json).slice(0, 120));

  const accept = await api('POST', `/api/bids/${bidId}/accept`, { token: owner });
  assert('接受投标成功并生成合同', accept.status === 200, JSON.stringify(accept.json).slice(0, 120));

  const acceptAgain = await api('POST', `/api/bids/${bidId}/accept`, { token: owner });
  assert('重复接受投标被拒绝', acceptAgain.status === 400);

  const projAfter = await api('GET', `/api/projects/${projectId}`, { token: owner });
  assert('接受投标后工程转为进行中', projAfter.json.status === 'in_progress');

  const skipSettle = await api('PUT', `/api/projects/${projectId}`, { token: owner, body: { status: 'completed' } });
  assert('存在履行中合同时不可绕过结算直接完工', skipSettle.status === 400);

  const delWithContract = await api('DELETE', `/api/projects/${projectId}`, { token: owner });
  assert('存在合同的工程不可删除（财务记录保护）', delWithContract.status === 400);

  // ---------- 8. 任务与里程碑 ----------
  console.log('【8】任务与里程碑');
  const task1 = await api('POST', `/api/projects/${projectId}/tasks`, {
    token: owner,
    body: { name: '现场勘察', description: '楼层勘察与点位确认', start_date: '2026-09-15', end_date: '2026-09-20', priority: 'high' }
  });
  assert('创建任务成功', task1.status === 201 && task1.json.task, JSON.stringify(task1.json).slice(0, 120));
  const taskId = task1.json.task.id;

  const task2 = await api('POST', `/api/projects/${projectId}/tasks`, {
    token: owner,
    body: { name: '桥架安装', start_date: '2026-09-21', end_date: '2026-10-10', assignee_id: 3 }
  });
  assert('创建带负责人的任务成功', task2.status === 201);

  const taskList = await api('GET', `/api/projects/${projectId}/tasks`, { token: owner });
  assert('任务列表与统计可用', taskList.status === 200 && taskList.json.tasks.length === 2 && typeof taskList.json.stats.overall_progress === 'number');

  const taskUpdate = await api('PUT', `/api/projects/${projectId}/tasks/${taskId}`, {
    token: owner,
    body: { status: 'in_progress', progress: 50 }
  });
  assert('更新任务进度成功', taskUpdate.status === 200 && taskUpdate.json.task.progress === 50);

  const completeTask = await api('PUT', `/api/projects/${projectId}/tasks/${taskId}`, {
    token: owner,
    body: { status: 'completed' }
  });
  assert('任务完成自动置进度100', completeTask.status === 200 && completeTask.json.task.progress === 100);

  const badProgress = await api('PUT', `/api/projects/${projectId}/tasks/${taskId}`, {
    token: owner,
    body: { progress: 150 }
  });
  assert('越界进度被拒绝', badProgress.status === 400);

  const reorder = await api('PUT', `/api/projects/${projectId}/tasks/batch/reorder`, {
    token: owner,
    body: { tasks: [{ id: taskId, sort_order: 2 }, { id: task2.json.task.id, sort_order: 1 }] }
  });
  assert('批量更新任务顺序成功', reorder.status === 200);

  const engTaskEdit = await api('PUT', `/api/projects/${projectId}/tasks/${taskId}`, {
    token: eng,
    body: { name: '越权修改' }
  });
  assert('非所有者不可修改任务', engTaskEdit.status === 403);

  const ms1 = await api('POST', `/api/projects/${projectId}/milestones`, {
    token: owner,
    body: { name: '阶段验收', description: '隐蔽工程验收', due_date: '2026-10-15' }
  });
  assert('创建里程碑成功', ms1.status === 201);

  const msList = await api('GET', `/api/projects/${projectId}/milestones`, { token: owner });
  assert('里程碑列表与预警字段可用', msList.status === 200 && msList.json.milestones.length === 1 && 'alert' in msList.json.milestones[0]);

  const msBadDate = await api('POST', `/api/projects/${projectId}/milestones`, {
    token: owner,
    body: { name: '坏日期', due_date: 'not-a-date' }
  });
  assert('非法日期被拒绝', msBadDate.status === 400);

  // ---------- 9. 资金与合同结算 ----------
  console.log('【9】资金与合同结算');
  const badDeposit = await api('POST', '/api/auth/deposit', { token: owner, body: { amount: 'abc' } });
  assert('非数字充值被拒绝', badDeposit.status === 400);

  const negDeposit = await api('POST', '/api/auth/deposit', { token: owner, body: { amount: -50 } });
  assert('负数充值被拒绝', negDeposit.status === 400);

  const bigDeposit = await api('POST', '/api/auth/deposit', { token: owner, body: { amount: 200000 } });
  assert('超限充值被拒绝', bigDeposit.status === 400);

  const engBalanceBefore = (await api('GET', '/api/auth/me', { token: eng })).json.balance;
  const deposit = await api('POST', '/api/auth/deposit', { token: owner, body: { amount: 100000 } });
  assert('正常充值成功', deposit.status === 200 && deposit.json.balance >= 100000);

  const myContracts = await api('GET', '/api/contracts/my', { token: owner });
  const contract = myContracts.json.find(c => c.project_id === projectId && c.status === 'active');
  assert('合同列表包含新合同', !!contract);

  // 上市硬化后：完工前必须双方签署合同 + 竣工验收通过
  const notSigned = await api('POST', `/api/contracts/${contract.id}/complete`, { token: owner });
  assert('未签署合同时完工被拒', notSigned.status === 400, JSON.stringify(notSigned.json).slice(0, 100));

  const engSign = await api('POST', `/api/contracts/${contract.id}/sign`, { token: eng, body: { password: '123456' } });
  assert('乙方签署合同', engSign.status === 200, JSON.stringify(engSign.json).slice(0, 100));
  const ownerSign = await api('POST', `/api/contracts/${contract.id}/sign`, { token: owner, body: { password: '123456' } });
  assert('甲方签署合同', ownerSign.status === 200);

  const noAcceptance = await api('POST', `/api/contracts/${contract.id}/complete`, { token: owner });
  assert('未竣工验收时完工被拒', noAcceptance.status === 400, JSON.stringify(noAcceptance.json).slice(0, 100));

  const finalAcc = await api('POST', `/api/projects/${projectId}/construction/acceptances`, {
    token: eng, body: { type: 'final', name: '竣工验收', content: '全部完工，申请验收' }
  });
  assert('提交竣工验收申请', finalAcc.status === 201);
  const accList = await api('GET', `/api/projects/${projectId}/construction/acceptances`, { token: owner });
  const finalAccItem = accList.json.items.find(a => a.type === 'final' && a.status === 'pending');
  const accPass = await api('PUT', `/api/projects/${projectId}/construction/acceptances/${finalAccItem.id}/review`, { token: owner, body: { status: 'approved' } });
  assert('竣工验收通过', accPass.status === 200);

  const engComplete = await api('POST', `/api/contracts/${contract.id}/complete`, { token: eng });
  assert('工程师不可确认完工（仅甲方）', engComplete.status === 403);

  const complete = await api('POST', `/api/contracts/${contract.id}/complete`, { token: owner });
  assert('甲方确认完工并结算', complete.status === 200, JSON.stringify(complete.json).slice(0, 120));

  const engBalanceAfter = (await api('GET', '/api/auth/me', { token: eng })).json.balance;
  // 商用化结算规则：工程款 88000 = 工程师到账(90%) + 平台佣金(5%) + 质保金(5%)
  assert('款项已划转给工程师（扣除5%佣金与5%质保金）', Math.abs(engBalanceAfter - engBalanceBefore - 88000 * 0.9) < 0.01,
    '到账 ' + (engBalanceAfter - engBalanceBefore));

  const projCompleted = await api('GET', `/api/projects/${projectId}`, { token: owner });
  assert('完工后工程状态为已完成', projCompleted.json.status === 'completed');

  // ---------- 10. 评价 ----------
  console.log('【10】评价');
  const review = await api('POST', '/api/reviews', {
    token: owner,
    body: { contract_id: contract.id, rating: 5, comment: '施工规范，验收一次通过。' }
  });
  assert('甲方评价成功', review.status === 200, JSON.stringify(review.json).slice(0, 120));

  const dupReview = await api('POST', '/api/reviews', {
    token: owner,
    body: { contract_id: contract.id, rating: 4, comment: '重复评价' }
  });
  assert('重复评价被拒绝', dupReview.status === 400);

  const badRating = await api('POST', '/api/reviews', {
    token: eng,
    body: { contract_id: contract.id, rating: 6, comment: '越界评分' }
  });
  assert('越界评分被拒绝', badRating.status === 400);

  const engReview = await api('POST', '/api/reviews', {
    token: eng,
    body: { contract_id: contract.id, rating: 4, comment: '甲方配合顺利。' }
  });
  assert('工程师互评成功', engReview.status === 200);

  const myReviews = await api('GET', '/api/reviews/user/3');
  assert('用户评价列表可查询', myReviews.status === 200 && myReviews.json.reviews.length >= 1);

  // ---------- 11. 消息 ----------
  console.log('【11】消息通知');
  const msgs = await api('GET', '/api/messages', { token: eng });
  assert('工程师收到投标/结算相关消息', msgs.status === 200 && msgs.json.total >= 2);
  assert('消息返回未读数', typeof msgs.json.unreadCount === 'number');

  const readAll = await api('POST', '/api/messages/read-all', { token: eng });
  assert('全部已读成功', readAll.status === 200);
  const msgsAfter = await api('GET', '/api/messages', { token: eng });
  assert('已读后未读数为0', msgsAfter.json.unreadCount === 0);

  const sendMsg = await api('POST', '/api/messages', {
    token: owner,
    body: { to_user_id: 3, title: '私信测试', content: '请于下周反馈竣工资料。' }
  });
  assert('站内私信发送成功', sendMsg.status === 200);

  const selfMsg = await api('POST', '/api/messages', {
    token: owner,
    body: { to_user_id: 2, title: '', content: '给自己发消息' }
  });
  assert('给自己发消息被拒绝', selfMsg.status === 400);

  // ---------- 12. 注册与角色（验证码接口限流 3 次/分钟，此处严格控制调用数）----------
  console.log('【12】注册与角色');
  const regPhone = '138' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  const regEmail = `audit_${Date.now()}@test.com`;

  await api('POST', '/api/verification/phone', { body: { phone: regPhone, purpose: 'register' } });
  const phoneCode = latestCode(regPhone, 'phone');
  assert('手机验证码已生成（生产环境不回传）', !!phoneCode);

  await api('POST', '/api/verification/email', { body: { email: regEmail, purpose: 'register' } });
  const emailCode = latestCode(regEmail, 'email');
  assert('邮箱验证码已生成', !!emailCode);

  const regUser = `audit_${Date.now()}`; // 19字符，满足4-20位要求
  const register = await api('POST', '/api/auth/register', {
    body: {
      accept_agreement: true, // 商用化新增：注册须勾选《用户协议》与《隐私政策》
      username: regUser,
      password: 'abc12345',
      role: 'engineer',
      real_name: '审计测试员',
      phone: regPhone,
      email: regEmail,
      phone_code: phoneCode,
      email_code: emailCode
    }
  });
  assert('注册成功且工程师角色生效', register.status === 200 && register.json.user && register.json.user.role === 'engineer',
    JSON.stringify(register.json).slice(0, 150));
  const newUserId = register.json.user ? register.json.user.id : null;

  const dupReg = await api('POST', '/api/auth/register', {
    body: {
      username: regUser, password: 'abc12345', role: 'user',
      real_name: 'x', phone: regPhone, email: regEmail,
      phone_code: phoneCode, email_code: emailCode
    }
  });
  assert('验证码一次性使用（重复注册被拒）', dupReg.status === 400);

  const weakPwd = await api('POST', '/api/auth/register', {
    body: { username: 'audit_x_' + Date.now(), password: '1234567890', role: 'user', phone: '139' + Date.now().toString().slice(-8), email: `x${Date.now()}@t.com`, phone_code: '000000', email_code: '000000' }
  });
  // 400=密码强度校验拒绝；连续重跑测试时 429=注册限流拒绝，两者均为正确防护行为
  assert('纯数字弱密码被拒绝', weakPwd.status === 400 || weakPwd.status === 429, `status=${weakPwd.status}`);

  // ---------- 13. 管理后台 ----------
  console.log('【13】管理后台');
  const certApply = await api('POST', '/api/auth/certify', {
    token: eng,
    body: { certification: '一级建造师（机电），10年弱电实施经验' }
  });
  assert('工程师认证申请提交成功', certApply.status === 200, JSON.stringify(certApply.json).slice(0, 120));

  const certList = await api('GET', '/api/admin/certifications', { token: admin });
  const pendingCert = certList.json.find(c => c.id === 3);
  assert('待审批列表返回解析后的认证信息', certList.status === 200 && pendingCert && pendingCert.certification_description && typeof pendingCert.certification_image_count === 'number');

  const approve = await api('POST', `/api/admin/certifications/3/approve`, { token: admin, body: { action: 'approve' } });
  assert('认证审批通过', approve.status === 200, JSON.stringify(approve.json).slice(0, 120));

  const approveAgain = await api('POST', `/api/admin/certifications/3/approve`, { token: admin, body: { action: 'approve' } });
  assert('重复审批被拒绝', approveAgain.status === 400);

  const badAction = await api('POST', `/api/admin/certifications/${newUserId}/approve`, { token: admin, body: { action: 'hack' } });
  assert('非法审批动作被拒绝', badAction.status === 400);

  const stats = await api('GET', '/api/admin/stats', { token: admin });
  assert('平台统计可用', stats.status === 200 && typeof stats.json.total_users === 'number' && Array.isArray(stats.json.recent_activity));

  const users = await api('GET', '/api/admin/users?keyword=audit', { token: admin });
  assert('用户搜索可用', users.status === 200 && users.json.data.length >= 1);

  const disable = await api('PUT', `/api/admin/users/${newUserId}/status`, { token: admin, body: { is_disabled: true } });
  assert('禁用用户成功', disable.status === 200);

  const disabledLogin = await api('POST', '/api/auth/login', { body: { username: regUser, password: 'abc12345' } });
  assert('被禁用用户登录被拒', disabledLogin.status === 403);

  const enable = await api('PUT', `/api/admin/users/${newUserId}/status`, { token: admin, body: { is_disabled: false } });
  assert('启用用户成功', enable.status === 200);

  const disableAdmin = await api('PUT', '/api/admin/users/1/status', { token: admin, body: { is_disabled: true } });
  assert('管理员账户不可被禁用', disableAdmin.status === 400);

  const roleChange = await api('PUT', `/api/admin/users/${newUserId}/role`, { token: admin, body: { role: 'user' } });
  assert('角色变更成功', roleChange.status === 200);

  const tx = await api('GET', '/api/admin/transactions', { token: admin });
  assert('财务交易记录可用', tx.status === 200 && tx.json.data.length >= 1 && tx.json.totalAmount >= 88000);

  const logs = await api('GET', '/api/admin/audit-logs', { token: admin });
  assert('审计日志可用', logs.status === 200 && logs.json.total >= 1);

  const nonAdmin = await api('GET', '/api/admin/stats', { token: owner });
  assert('非管理员访问后台被拒', nonAdmin.status === 403);

  // ---------- 14. 强制取消与删除 ----------
  console.log('【14】强制取消与清理');
  const pub2 = await api('POST', '/api/projects', {
    token: owner,
    body: { title: `回归测试-可取消项目${Date.now() % 10000}`, category: '安防监控', budget: 50000 }
  });
  const proj2 = pub2.json.id;

  const cancel = await api('POST', `/api/projects/${proj2}/cancel`, { token: owner });
  assert('取消工程成功', cancel.status === 200);

  const del2 = await api('DELETE', `/api/projects/${proj2}`, { token: owner });
  assert('无合同工程可删除', del2.status === 200, JSON.stringify(del2.json).slice(0, 120));

  const delGone = await api('GET', `/api/projects/${proj2}`);
  assert('删除后工程不存在', delGone.status === 404);

  const forceCancel = await api('POST', '/api/admin/projects/1/cancel', { token: admin });
  assert('管理员强制取消接口可用（或工程已结束）', forceCancel.status === 200 || forceCancel.status === 400);

  // ---------- 15. 令牌生命周期 ----------
  console.log('【15】令牌生命周期');
  const refresh1 = await api('POST', '/api/auth/refresh', { body: { refreshToken: ownerLogin.json.refreshToken } });
  assert('刷新令牌轮换成功', refresh1.status === 200 && refresh1.json.accessToken, JSON.stringify(refresh1.json).slice(0, 120));

  const refreshReuse = await api('POST', '/api/auth/refresh', { body: { refreshToken: ownerLogin.json.refreshToken } });
  assert('旧刷新令牌轮换后失效（防重放）', refreshReuse.status === 401);

  const logoutRes = await api('POST', '/api/auth/logout', {
    token: refresh1.json.accessToken,
    body: { refreshToken: refresh1.json.refreshToken }
  });
  assert('登出成功', logoutRes.status === 200);

  const afterLogout = await api('GET', '/api/auth/me', { token: refresh1.json.accessToken });
  assert('登出后访问令牌立即失效（黑名单）', afterLogout.status === 401);

  const refreshAfterLogout = await api('POST', '/api/auth/refresh', { body: { refreshToken: refresh1.json.refreshToken } });
  assert('登出后刷新令牌失效', refreshAfterLogout.status === 401);

  const relogin = await api('POST', '/api/auth/login', { body: { username: 'zhangsan', password: '123456' } });
  assert('重新登录正常', relogin.status === 200);

  // ---------- 16. 输入与分页防护 ----------
  console.log('【16】输入与分页防护');
  const hugePage = await api('GET', '/api/projects?pageSize=100000&page=999');
  assert('分页参数被钳制（pageSize≤100）', hugePage.status === 200 && hugePage.json.pageSize <= 100);

  const badPhoneCode = await api('POST', '/api/verification/phone', { body: { phone: '123', purpose: 'register' } });
  assert('非法手机号被拒绝', badPhoneCode.status === 400 || badPhoneCode.status === 429, `status=${badPhoneCode.status}`);

  const badPurpose = await api('POST', '/api/verification/phone', { body: { phone: '13900001111', purpose: 'hack' } });
  assert('非法验证用途被拒绝', badPurpose.status === 400 || badPurpose.status === 429, `status=${badPurpose.status}`);

  const sqliLike = await api('GET', `/api/projects?keyword=${encodeURIComponent("%' OR 1=1 --")}`);
  assert('LIKE 注入参数化处理（返回空集而非异常）', sqliLike.status === 200);

  // ---------- 17. 新功能回归：撤回投标/工程师主页/评价/对账/公告/金额调整/附件 ----------
  console.log('【17】新功能回归');
  // 投标撤回闭环：发布 -> 投标 -> 撤回 -> 可重新投标
  const wdProj = await api('POST', '/api/projects', {
    token: owner,
    body: { title: `回归测试-撤回投标工程${Date.now() % 10000}`, description: '验证投标撤回功能的自动化测试工程。', category: '其他', location: '测试' }
  });
  const wdProjId = wdProj.json.id;
  const wdBid = await api('POST', '/api/bids', { token: eng, body: { project_id: wdProjId, price: 5000, message: '撤回投标测试的方案描述，超过二十个字符。' } });
  const withdraw = await api('POST', `/api/bids/${wdBid.json.id}/withdraw`, { token: eng });
  assert('撤回投标成功', withdraw.status === 200, JSON.stringify(withdraw.json));
  const reBid = await api('POST', '/api/bids', { token: eng, body: { project_id: wdProjId, price: 6000, message: '撤回后重新投标的方案描述，超过二十个字符。' } });
  assert('撤回后可重新投标', reBid.status === 200);
  const withdrawAgain = await api('POST', `/api/bids/${reBid.json.id}/withdraw`, { token: eng });
  assert('再次撤回成功（投标恢复为未投标状态）', withdrawAgain.status === 200);
  const withdrawGone = await api('POST', `/api/bids/${reBid.json.id}/withdraw`, { token: eng });
  assert('撤回后重复撤回被拒（投标已不存在）', withdrawGone.status === 404);

  // 工程师公开主页（不接受投标撤回工程，用种子工程师账号）
  const meEng = await api('GET', '/api/auth/me', { token: eng });
  const engProfile = await api('GET', `/api/users/${meEng.json.id}/profile`);
  assert('工程师公开主页可访问', engProfile.status === 200 && engProfile.json.stats && engProfile.json.stats.avg_rating !== undefined,
    JSON.stringify(engProfile.json).slice(0, 120));
  assert('公开主页不泄露联系方式', engProfile.json.phone === undefined && engProfile.json.email === undefined && engProfile.json.real_name === undefined);

  // 按项目查询评价
  const projReviews = await api('GET', `/api/reviews/project/${wdProjId}`);
  assert('按项目查询评价接口可用', projReviews.status === 200 && Array.isArray(projReviews.json.items));

  // 合同金额调整（签署前议价）：新工程走 投标->接受->调价
  const amount = await api('PUT', `/api/contracts/99999999/amount`, { token: owner, body: { amount: 8888 } });
  assert('不存在的合同调整金额被拒', amount.status === 404);

  // 附件校验：纠纷引用不存在的照片被拒
  const badPhotoDispute = await api('POST', '/api/biz/disputes', {
    token: eng, body: { project_id: wdProjId, reason: '附件校验测试', photo_ids: [999999] }
  });
  assert('纠纷引用不存在的照片被拒', badPhotoDispute.status === 400);

  // 平台资金对账
  const reconcile = await api('GET', '/api/admin/reconcile', { token: admin });
  assert('平台资金对账接口可用', reconcile.status === 200 && typeof reconcile.json.user_balance_total === 'number' && typeof reconcile.json.diff === 'number',
    JSON.stringify(reconcile.json).slice(0, 150));

  // 系统公告群发
  const broadcast = await api('POST', '/api/admin/broadcast', { token: admin, body: { title: '回归测试公告', content: '这是一条自动化回归测试公告，可忽略。' } });
  assert('系统公告群发成功', broadcast.status === 200 && /已发送给/.test(broadcast.json.message || ''), JSON.stringify(broadcast.json));
  const ownerMsgs = await api('GET', '/api/messages', { token: owner });
  assert('公告送达用户消息中心', (ownerMsgs.json.data || []).some(m => m.title === '回归测试公告'));

  // 清理撤回投标测试工程（未签合同可直接删）
  await api('POST', `/api/projects/${wdProjId}/cancel`, { token: owner });
  const delWdProj = await api('DELETE', `/api/projects/${wdProjId}`, { token: owner });
  assert('测试工程清理完成', delWdProj.status === 200);

  // ---------- 结果 ----------
  console.log('\n==============================================');
  console.log(` 测试结果：通过 ${passed} 项，失败 ${failed} 项`);
  if (failures.length) {
    console.log(' 失败清单：');
    failures.forEach(f => console.log('   - ' + f));
  }
  console.log('==============================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
