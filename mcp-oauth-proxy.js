import http from 'node:http';import https from 'node:https';import { isSameOriginRequest } from './request-guard.js';import { requireAllowedOAuthTarget } from './mcp-oauth-targets.js';
export const MCP_OAUTH_PROXY_PATH='/__mcp_oauth';export function isMcpOAuthProxyRequest(u){return u===MCP_OAUTH_PROXY_PATH||u.startsWith(MCP_OAUTH_PROXY_PATH+'?');}
export function handleMcpOAuthProxy(req,res){return new Promise(r=>{if(!isSameOriginRequest(req)){res.writeHead(403);res.end();return r();}
const t=new URL(req.url??'/','http://x').searchParams.get('target');if(!t){res.writeHead(400);res.end('Missing target');return r();}
let u;try{u=requireAllowedOAuthTarget(t);}catch(e){res.writeHead(400);res.end(String(e.message||e));return r();}
const m=req.method==='GET'||req.method==='POST'?req.method:null;if(!m){res.writeHead(405);res.end();return r();}
const lib=u.protocol==='https:'?https:http;const ch=[];req.on('data',c=>ch.push(c));req.on('end',()=>{const b=m==='POST'&&ch.length?Buffer.concat(ch):undefined;
const up=lib.request({protocol:u.protocol,hostname:u.hostname,port:u.port||(u.protocol==='https:'?443:80),path:u.pathname+u.search,method:m},rs=>{res.writeHead(rs.statusCode??502,{'Content-Type':rs.headers['content-type']??'application/json'});rs.pipe(res);rs.on('end',r);});
up.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();r();});if(b)up.write(b);up.end();});});}