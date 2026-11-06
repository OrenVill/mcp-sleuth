#!/usr/bin/env node
/** Applies MCP OAuth feature files. Run: node scripts/apply-mcp-oauth.mjs */
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const w = (rel, c) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c);
};
const patch = (rel, from, to) => {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`patch miss ${rel}`);
  fs.writeFileSync(p, s.replace(from, to));
};

w('mcp-oauth-targets.js', `const W=['/.well-known/oauth-protected-resource','/.well-known/oauth-authorization-server','/.well-known/openid-configuration'];const T=['/token','/register','/revoke','/introspect'];
function ok(p){const l=(p||'/').toLowerCase();return W.some(s=>l===s||l.endsWith(s))||T.some(s=>l.endsWith(s));}
export function isAllowedOAuthTarget(u){return u instanceof URL&&(u.protocol==='http:'||u.protocol==='https:')&&ok(u.pathname);}
export function requireAllowedOAuthTarget(s){const u=new URL(s);if(!isAllowedOAuthTarget(u))throw new Error('OAuth target path is not permitted');return u;}`);

w('mcp-oauth-proxy.js', `import http from 'node:http';import https from 'node:https';import { isSameOriginRequest } from './request-guard.js';import { requireAllowedOAuthTarget } from './mcp-oauth-targets.js';
export const MCP_OAUTH_PROXY_PATH='/__mcp_oauth';export function isMcpOAuthProxyRequest(u){return u===MCP_OAUTH_PROXY_PATH||u.startsWith(MCP_OAUTH_PROXY_PATH+'?');}
export function handleMcpOAuthProxy(req,res){return new Promise(r=>{if(!isSameOriginRequest(req)){res.writeHead(403);res.end();return r();}
const t=new URL(req.url??'/','http://x').searchParams.get('target');if(!t){res.writeHead(400);res.end('Missing target');return r();}
let u;try{u=requireAllowedOAuthTarget(t);}catch(e){res.writeHead(400);res.end(String(e.message||e));return r();}
const m=req.method==='GET'||req.method==='POST'?req.method:null;if(!m){res.writeHead(405);res.end();return r();}
const lib=u.protocol==='https:'?https:http;const ch=[];req.on('data',c=>ch.push(c));req.on('end',()=>{const b=m==='POST'&&ch.length?Buffer.concat(ch):undefined;
const up=lib.request({protocol:u.protocol,hostname:u.hostname,port:u.port||(u.protocol==='https:'?443:80),path:u.pathname+u.search,method:m},rs=>{res.writeHead(rs.statusCode??502,{'Content-Type':rs.headers['content-type']??'application/json'});rs.pipe(res);rs.on('end',r);});
up.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();r();});if(b)up.write(b);up.end();});});}`);

w('mcp-oauth-targets.test.js', `import { describe,it,expect } from 'vitest';import { isAllowedOAuthTarget } from './mcp-oauth-targets.js';it('token',()=>{expect(isAllowedOAuthTarget(new URL('https://a/token'))).toBe(true);});`);
w('mcp-oauth-proxy.test.js', `import { describe,it,expect } from 'vitest';import { isMcpOAuthProxyRequest,MCP_OAUTH_PROXY_PATH } from './mcp-oauth-proxy.js';it('path',()=>{expect(isMcpOAuthProxyRequest(MCP_OAUTH_PROXY_PATH)).toBe(true);});`);

// src/lib/mcpOAuth/*
w('src/lib/mcpOAuth/constants.ts', `export const OAUTH_CALLBACK_PATH='/oauth/callback';export const OAUTH_FLOW_STORAGE_KEY='mcp-detective:oauth-flow';
import type { OAuthClientMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
export function oauthRedirectUrl(o:string){return new URL(OAUTH_CALLBACK_PATH,o).href;}
export function clientMetadataForOrigin(o:string):OAuthClientMetadata{return{client_name:'MCP Detective',redirect_uris:[oauthRedirectUrl(o)],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'};}`);
w('src/lib/mcpOAuth/types.ts', `import type { ServerOAuthSession } from '../../types';import type { OAuthDiscoveryState,OAuthTokens } from '@modelcontextprotocol/sdk/client/auth.js';import type { OAuthClientInformationMixed } from '@modelcontextprotocol/sdk/shared/auth.js';
export interface PendingOAuthFlow{serverId:string;mcpServerUrl:string;proxyThroughLocal:boolean;allowSelfSigned:boolean;state:string;}
export function tokensFromOAuthSession(s?:ServerOAuthSession){if(!s?.accessToken)return undefined;return{access_token:s.accessToken,refresh_token:s.refreshToken,token_type:s.tokenType??'Bearer',scope:s.scope};}
export function clientInformationFromSession(s?:ServerOAuthSession){if(!s?.clientId)return undefined;return{client_id:s.clientId,client_secret:s.clientSecret};}
export function discoveryStateFromSession(s?:ServerOAuthSession){if(!s?.discovery)return undefined;return s.discovery as OAuthDiscoveryState;}
export function mergeTokensIntoSession(s:ServerOAuthSession|undefined,t:OAuthTokens){return{...s,accessToken:t.access_token,refreshToken:t.refresh_token??s?.refreshToken,tokenType:t.token_type,scope:t.scope??s?.scope,expiresAt:t.expires_in?Date.now()+t.expires_in*1000:s?.expiresAt};}
export function mergeClientIntoSession(s:ServerOAuthSession|undefined,c:OAuthClientInformationMixed){return{...s,clientId:c.client_id,clientSecret:'client_secret'in c?c.client_secret:s?.clientSecret};}
export function mergeDiscoveryIntoSession(s:ServerOAuthSession|undefined,d:OAuthDiscoveryState){return{...s,discovery:{...d} as Record<string,unknown>};}
`);
w('src/lib/mcpOAuth/sessionRegistry.ts', `import type { ServerAuth } from '../../types';const m=new Map<string,(a:ServerAuth)=>void>();export function registerOAuthSessionWriter(id:string,fn:(a:ServerAuth)=>void){m.set(id,fn);return()=>m.delete(id);}export function writeOAuthSession(id:string,a:ServerAuth){m.get(id)?.(a);}`);
w('src/lib/mcpOAuth/fetchBridge.ts', `import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';import { getHost } from '../host';import { MCP_OAUTH_PROXY_PATH } from '../../../mcp-oauth-proxy.js';
export function createMcpOAuthFetch():FetchLike{return getHost().kind==='electron'?async(i,init)=>{const t=typeof i==='string'?i:i.href;const h:Record<string,string>={};if(init?.headers)new Headers(init.headers).forEach((v,k)=>{h[k]=v;});let b:string|undefined;if(init?.body!=null)b=typeof init.body==='string'?init.body:await new Response(init.body).text();const r=await getHost().oauth.fetch(t,{method:init?.method??'GET',headers:h,body:b});return new Response(r.body,{status:r.status,statusText:r.statusText,headers:r.headers});}:async(i,init)=>fetch(\`\${window.location.origin}\${MCP_OAUTH_PROXY_PATH}?target=\${encodeURIComponent(typeof i==='string'?i:i.href)}\`,init);}`);
w('src/lib/mcpOAuth/provider.ts', `import type { OAuthClientProvider,OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';import type { OAuthClientInformationMixed,OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { clientInformationFromSession,discoveryStateFromSession,mergeClientIntoSession,mergeDiscoveryIntoSession,mergeTokensIntoSession,tokensFromOAuthSession,type PendingOAuthFlow } from './types';import type { ServerAuth } from '../../types';import { clientMetadataForOrigin,OAUTH_FLOW_STORAGE_KEY } from './constants';
export interface OAuthProviderCallbacks{getAuth:()=>ServerAuth|undefined;onSessionChange:(s:import('../../types').ServerOAuthSession)=>void;onRedirect:(u:URL)=>void;}
let v:string|undefined,st:string|undefined;export function readPendingOAuthFlow():PendingOAuthFlow|null{try{const r=sessionStorage.getItem(OAUTH_FLOW_STORAGE_KEY);return r?JSON.parse(r):null;}catch{return null;}}export function writePendingOAuthFlow(f:PendingOAuthFlow){sessionStorage.setItem(OAUTH_FLOW_STORAGE_KEY,JSON.stringify(f));}export function clearPendingOAuthFlow(){sessionStorage.removeItem(OAUTH_FLOW_STORAGE_KEY);}
export function createDetectiveOAuthProvider(origin:string,cb:OAuthProviderCallbacks):OAuthClientProvider{const md=clientMetadataForOrigin(origin);return{get redirectUrl(){return md.redirect_uris[0];},get clientMetadata(){return md;},state(){if(!st)st=crypto.randomUUID();return st;},clientInformation(){return clientInformationFromSession(cb.getAuth()?.oauth);},saveClientInformation(ci:OAuthClientInformationMixed){const a=cb.getAuth();if(!a||a.method!=='oauth')return;cb.onSessionChange(mergeClientIntoSession(a.oauth,ci));},tokens(){return tokensFromOAuthSession(cb.getAuth()?.oauth);},saveTokens(t:OAuthTokens){const a=cb.getAuth();if(!a||a.method!=='oauth')return;cb.onSessionChange(mergeTokensIntoSession(a.oauth,t));},redirectToAuthorization(u:URL){cb.onRedirect(u);},saveCodeVerifier(x:string){v=x;},codeVerifier(){if(!v)throw new Error('No PKCE verifier');return v;},saveDiscoveryState(d:OAuthDiscoveryState){const a=cb.getAuth();if(!a||a.method!=='oauth')return;cb.onSessionChange(mergeDiscoveryIntoSession(a.oauth,d));},discoveryState(){return discoveryStateFromSession(cb.getAuth()?.oauth);},invalidateCredentials(s){if(s==='verifier'||s==='all'){v=undefined;st=undefined;}}};}`);
w('src/lib/mcpOAuth/refreshOnce.ts', `import { refreshAuthorization,discoverOAuthServerInfo,type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';import type { ServerAuth } from '../../types';import { createMcpOAuthFetch } from './fetchBridge';import { clientInformationFromSession,discoveryStateFromSession,mergeDiscoveryIntoSession,mergeTokensIntoSession,tokensFromOAuthSession } from './types';
export async function refreshOAuthSessionOnce(auth:ServerAuth,mcpUrl:string){if(auth.method!=='oauth'||!auth.oauth?.refreshToken)return undefined;const ci=clientInformationFromSession(auth.oauth);if(!ci)return undefined;let d:OAuthDiscoveryState|undefined=discoveryStateFromSession(auth.oauth);const f=createMcpOAuthFetch();if(!d?.authorizationServerUrl){const i=await discoverOAuthServerInfo(mcpUrl,{fetchFn:f});d={authorizationServerUrl:i.authorizationServerUrl,authorizationServerMetadata:i.authorizationServerMetadata,resourceMetadata:i.resourceMetadata};}
const t=await refreshAuthorization(d.authorizationServerUrl,{metadata:d.authorizationServerMetadata,clientInformation:ci,refreshToken:auth.oauth.refreshToken,fetchFn:f});const p=tokensFromOAuthSession(auth.oauth);if(p?.refresh_token&&!t.refresh_token)t.refresh_token=p.refresh_token;return{...auth,oauth:mergeDiscoveryIntoSession(mergeTokensIntoSession(auth.oauth,t),d)};}`);
w('src/lib/mcpOAuth/connectOAuth.ts', `import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';import type { ServerAuth } from '../../types';import type { McpConnectOptions } from '../host/types';import { transportUrlForServer } from '../host/browser/mcpBrowser';import { createDetectiveOAuthProvider,writePendingOAuthFlow,type PendingOAuthFlow } from './provider';import { createMcpOAuthFetch } from './fetchBridge';import { writeOAuthSession } from './sessionRegistry';
export function beginOAuthRedirect(id:string,url:string,proxy:boolean,opt:McpConnectOptions,u:URL){writePendingOAuthFlow({serverId:id,mcpServerUrl:url,proxyThroughLocal:proxy,allowSelfSigned:opt.allowSelfSigned??false,state:u.searchParams.get('state')??''} as PendingOAuthFlow);}
export async function finishOAuthAuthorization(p:{serverId:string;url:string;auth:ServerAuth;proxyThroughLocal:boolean;options:McpConnectOptions;authorizationCode:string}){let cur=p.auth;const pr=createDetectiveOAuthProvider(window.location.origin,{getAuth:()=>cur,onSessionChange:s=>{cur={...cur,oauth:s};writeOAuthSession(p.serverId,cur);},onRedirect:()=>{}});const tr=new StreamableHTTPClientTransport(transportUrlForServer(p.url,p.proxyThroughLocal,undefined,p.options),{authProvider:pr,fetch:createMcpOAuthFetch()});await tr.finishAuth(p.authorizationCode);await tr.close();}`);
w('src/lib/mcpOAuth/provider.test.ts', `import { describe,expect,it,vi } from 'vitest';import { createDetectiveOAuthProvider } from './provider';import type { ServerAuth } from '../../types';it('tokens',async()=>{let a:ServerAuth={method:'oauth',oauth:{}};const p=createDetectiveOAuthProvider('http://127.0.0.1:4173',{getAuth:()=>a,onSessionChange:s=>{a={method:'oauth',oauth:s};},onRedirect:vi.fn()});await p.saveTokens({access_token:'t',token_type:'Bearer'});expect(a.oauth?.accessToken).toBe('t');});`);
w('src/lib/mcpOAuth/types.test.ts', `import { describe,expect,it } from 'vitest';import { mergeTokensIntoSession } from './types';it('merge',()=>{expect(mergeTokensIntoSession(undefined,{access_token:'a',token_type:'Bearer'}).accessToken).toBe('a');});`);

w('src/lib/host/browser/oauthBrowser.ts', `import type { OAuthHost } from '../types';import { MCP_OAUTH_PROXY_PATH } from '../../../mcp-oauth-proxy.js';export const oauthBrowserHost:OAuthHost={async fetch(target,init={}){const url=\`\${window.location.origin}\${MCP_OAUTH_PROXY_PATH}?target=\${encodeURIComponent(target)}\`;const res=await fetch(url,{method:init.method??'GET',headers:init.headers,body:init.body});const body=await res.text();const headers:Record<string,string>={};res.headers.forEach((v,k)=>{headers[k]=v;});return{ok:res.ok,status:res.status,statusText:res.statusText,headers,body};}};`);
w('src/lib/host/electron/oauthElectron.ts', `import type { ElectronBridge } from './mcpElectron';import type { OAuthHost } from '../types';import { unwrapEnvelope } from './mcpElectron';export function createElectronOAuthHost(b:ElectronBridge):OAuthHost{return{async fetch(target,init){return unwrapEnvelope(await b.invoke('mcp:oauthFetch',{target,...init})) as Awaited<ReturnType<OAuthHost['fetch']>>;}};}`);
w('electron/ipc/oauthHandlers.js', `import { requireAllowedOAuthTarget } from '../../mcp-oauth-targets.js';import { UNTRUSTED_SENDER_CODE,isTrustedSender } from './senderGuard.js';export async function oauthFetch({target,method='GET',headers={},body}){const u=requireAllowedOAuthTarget(target);const res=await fetch(u.href,{method,headers,body:method==='POST'?body:undefined});const text=await res.text();const out={};res.headers.forEach((v,k)=>{out[k]=v;});return{ok:res.ok,status:res.status,statusText:res.statusText,headers:out,body:text};}export function registerOAuthHandlers(ipcMain,CHANNELS,ok,fail){ipcMain.handle(CHANNELS.oauthFetch,async(e,p)=>{if(!isTrustedSender(e.sender))return fail(UNTRUSTED_SENDER_CODE,'Untrusted sender');try{return ok(await oauthFetch(p??{}));}catch(err){return fail('oauth_fetch_failed',err instanceof Error?err.message:String(err));}});}`);

patch('src/types.ts', `export type ServerAuthMethod = 'none' | 'bearer' | 'api_key' | 'basic';

export interface ServerAuth {
  method: ServerAuthMethod;`, `export type ServerAuthMethod = 'none' | 'bearer' | 'api_key' | 'basic' | 'oauth';

export interface ServerOAuthSession {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  clientId?: string;
  clientSecret?: string;
  discovery?: Record<string, unknown>;
}

export interface ServerAuth {
  method: ServerAuthMethod;
  oauth?: ServerOAuthSession;`);

patch('src/lib/host/types.ts', `export interface Host {
  readonly kind: 'browser' | 'electron';
  readonly mcp: McpHost;
  readonly files: FilesHost;
  readonly secrets: SecretsHost;
  readonly updates: UpdateHost;
  readonly llm: LlmHost;
}`, `export interface OAuthHost {
  fetch(target: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ ok: boolean; status: number; statusText: string; headers: Record<string, string>; body: string }>;
}
export interface Host {
  readonly kind: 'browser' | 'electron';
  readonly mcp: McpHost;
  readonly files: FilesHost;
  readonly secrets: SecretsHost;
  readonly updates: UpdateHost;
  readonly llm: LlmHost;
  readonly oauth: OAuthHost;
}`);

patch('src/lib/host/index.ts', "export type { FilesHost, Host, McpHost, UpdateHost, UpdateStatus } from './types';", "export type { FilesHost, Host, McpHost, OAuthHost, UpdateHost, UpdateStatus } from './types';");
patch('src/lib/host/browser/index.ts', "import { llmBrowser } from './llmBrowser';", "import { llmBrowser } from './llmBrowser';\nimport { oauthBrowserHost } from './oauthBrowser';");
patch('src/lib/host/browser/index.ts', `  llm: llmBrowser,
};`, `  llm: llmBrowser,
  oauth: oauthBrowserHost,
};`);
patch('src/lib/host/electron/index.ts', "import { createLlmElectron, type LlmBridge } from './llmElectron';", "import { createLlmElectron, type LlmBridge } from './llmElectron';\nimport { createElectronOAuthHost } from './oauthElectron';");
patch('src/lib/host/electron/index.ts', `    llm: createLlmElectron(bridge as unknown as LlmBridge),
  };
}`, `    llm: createLlmElectron(bridge as unknown as LlmBridge),
    oauth: createElectronOAuthHost(bridge),
  };
}`);
patch('electron/ipc/channels.js', "  llmListModels: 'mcp:llmListModels',", "  llmListModels: 'mcp:llmListModels',\n  oauthFetch: 'mcp:oauthFetch',");
patch('electron/preload.cjs', "  'mcp:updateOpenRelease',\n];", "  'mcp:updateOpenRelease',\n  'mcp:oauthFetch',\n];");
patch('electron/main.js', "import { registerLlmHandlers } from './ipc/llmHandlers.js';", "import { registerLlmHandlers } from './ipc/llmHandlers.js';\nimport { registerOAuthHandlers } from './ipc/oauthHandlers.js';");
patch('electron/main.js', "    registerLlmHandlers(ipcMain, CHANNELS, ok, fail);", "    registerLlmHandlers(ipcMain, CHANNELS, ok, fail);\n    registerOAuthHandlers(ipcMain, CHANNELS, ok, fail);");
patch('server.js', "import { handleLlmProxy, isLlmProxyRequest } from './llm-proxy.js';", "import { handleLlmProxy, isLlmProxyRequest } from './llm-proxy.js';\nimport { handleMcpOAuthProxy, isMcpOAuthProxyRequest } from './mcp-oauth-proxy.js';");
patch('server.js', "      isLlmProxyRequest(url) ||\n      url.startsWith(STDIO_BRIDGE_PREFIX)", "      isLlmProxyRequest(url) ||\n      isMcpOAuthProxyRequest(url) ||\n      url.startsWith(STDIO_BRIDGE_PREFIX)");
patch('server.js', `    if (isLlmProxyRequest(url)) {
      handleLlmProxy(req, res).catch((err) => failRequest(res, err, 'llm proxy'));
      return;
    }`, `    if (isLlmProxyRequest(url)) {
      handleLlmProxy(req, res).catch((err) => failRequest(res, err, 'llm proxy'));
      return;
    }
    if (isMcpOAuthProxyRequest(url)) {
      handleMcpOAuthProxy(req, res).catch((err) => failRequest(res, err, 'mcp oauth proxy'));
      return;
    }`);
patch('mcp/sessions.js', "  if (auth.method === 'bearer' && auth.bearerToken?.trim()) {", "  if (auth.method === 'oauth' && auth.oauth?.accessToken?.trim()) {\n    headers.Authorization = `Bearer ${auth.oauth.accessToken.trim()}`;\n  } else if (auth.method === 'bearer' && auth.bearerToken?.trim()) {");
patch('package.json', '    "llm-targets.d.ts"\n  ],', '    "llm-targets.d.ts",\n    "mcp-oauth-proxy.js",\n    "mcp-oauth-targets.js"\n  ],');
patch('electron-builder.yml', '  - llm-targets.js\n  - package.json', '  - llm-targets.js\n  - mcp-oauth-targets.js\n  - package.json');

console.log('apply-mcp-oauth: core ok');
