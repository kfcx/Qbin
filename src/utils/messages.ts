/**
 * Standardized response messages for the application
 * Provides consistent, clear, and helpful messages for users
 */
export const ResponseMessages = {
  // Success messages
  SUCCESS: "操作成功完成",
  LOGGED_OUT: "成功退出登录",
  
  // General errors
  SERVER_ERROR: "服务器处理请求出错，请稍后重试",
  UNAUTHORIZED: "未登录，请先登录后再操作",
  FORBIDDEN: "当前账号没有执行此操作的权限",
  
  // Content related
  CONTENT_TOO_LARGE: "内容超出允许大小限制",
  INVALID_CONTENT_TYPE: "不支持此内容格式",
  CONTENT_NOT_FOUND: "内容不存在或已过期",
  
  // Path and key related
  PATH_EMPTY: "访问路径不能为空",
  PATH_UNAVAILABLE: "该访问路径格式无效或不可用",
  PATH_RESERVED: "此路径已被系统保留，无法使用",
  KEY_EXISTS: "此路径已被使用，请更换",
  
  // Authentication related
  PASSWORD_INCORRECT: "访问密码错误，请检查后重试",
  LOGIN_REQUIRED: "请先登录再操作",
  ADMIN_REQUIRED: "需要管理员权限",
  PERMISSION_DENIED: "当前账号无权修改或删除此内容",
  
  // Security related
  REFERER_INVALID: "检测到可疑来源，操作被拒绝",
  REFERER_DISALLOWED: "不允许从此页面发起请求",
  TOKEN_INVALID: "登录已过期，请重新登录",
  
  // Demo limitations
  DEMO_RESTRICTED: "演示环境不支持此操作",
  
  // Pagination related
  INVALID_PAGE: "页码无效",
  INVALID_PAGE_SIZE: "每页数量参数无效",
  
  // Database related
  DB_UPDATE_FAILED: "数据更新失败，请重试",
  SYNC_COMPLETED: "数据同步完成",
}; 