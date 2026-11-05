const W=['/.well-known/oauth-protected-resource','/.well-known/oauth-authorization-server','/.well-known/openid-configuration'];const T=['/token','/access_token','/register','/revoke','/introspect'];
function ok(p){const l=(p||'/').toLowerCase();return W.some(s=>l===s||l.endsWith(s))||T.some(s=>l.endsWith(s));}
export function isAllowedOAuthTarget(u){return u instanceof URL&&(u.protocol==='http:'||u.protocol==='https:')&&ok(u.pathname);}
export function requireAllowedOAuthTarget(s){const u=new URL(s);if(!isAllowedOAuthTarget(u))throw new Error('OAuth target path is not permitted');return u;}