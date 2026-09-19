// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 居民身份证号校验（GB 11643-1999 校验位算法）
 * 注意：本地校验只能验证格式与校验位合法性，不能证明号码与持有人匹配。
 * 真实姓名-身份证二要素/三要素核验需对接公安授权服务商（见 docs/COMMERCIAL.md）。
 */

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * 校验 18 位身份证号
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateIdCard(idCard) {
  const id = String(idCard || '').toUpperCase().trim();
  if (!/^\d{17}[\dX]$/.test(id)) {
    return { valid: false, reason: '身份证号必须为18位（末位可为X）' };
  }

  const birth = `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
  const birthDate = new Date(birth);
  if (
    Number.isNaN(birthDate.getTime())
    || birth < '1900-01-01'
    || birth > new Date().toISOString().split('T')[0]
    || birthDate.toISOString().split('T')[0] !== birth
  ) {
    return { valid: false, reason: '身份证出生日期无效' };
  }

  // 省级行政区代码粗校验（11-65）
  const province = Number(id.slice(0, 2));
  if (province < 11 || province > 65) {
    return { valid: false, reason: '身份证省份代码无效' };
  }

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += Number(id[i]) * ID_WEIGHTS[i];
  }
  if (ID_CHECK_CODES[sum % 11] !== id[17]) {
    return { valid: false, reason: '身份证校验位不正确' };
  }

  return { valid: true };
}

module.exports = { validateIdCard };
