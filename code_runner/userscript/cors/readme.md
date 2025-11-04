# 使用方法
1. 引导用户安装本脚本并刷新页面使脚本生效
2. 在代码中可以直接调用`window.corsFetch`或者`corsFetch`函数，调用方法同原生`fetch`函数，即可直接访问Glot等网站，无需cors-anywhere中间件

# 开发指南
## 获取typescript源代码
脚本采用typescript开发，最好以typescript进行编辑再编译
1. `npm install`
2. 编辑typescript源代码
3. `npm run build`
 
## 添加网站连接
为防止XSS等攻击，脚本提供`corsFetch`对可以连接的域名有明确的限制，如需添加可连接的域名，请按以下步骤操作：
1. 将域名添加到 `AllowedDomains` 数组中
2. 在脚本头中添加对应的`@connect`标签