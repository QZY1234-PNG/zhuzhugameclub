const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(__dirname+'/../publisher.js','utf8');
function harness(fetch){const ctx=vm.createContext({fetch,crypto:webcrypto,TextDecoder,Uint8Array,atob,AbortSignal});vm.runInContext(source,ctx);return ctx;}
const ctx=harness();const merge=ctx.mergePublishedContent;
const order=(id,extra={})=>({id,title:id,category:'趣味单合集',details:[],...extra});
const content=(orders,settings={})=>({schemaVersion:1,orders,settings});
const plain=v=>JSON.parse(JSON.stringify(v));
test('属性顺序与缺省图片字段不同不会误判冲突',()=>{
 const base=content([order('一单')]);
 const remote={settings:{contactImage:'',heroImageTwo:'',heroImageOne:''},orders:[{details:[],active:true,category:'趣味单合集',title:'一单',id:'一单',coverImage:'',image:''}],schemaVersion:1};
 const result=merge(base,content([order('一单'),order('新增')]),remote);
 assert.deepEqual(plain(result.orders.map(o=>o.id)),['一单','新增']);
});
test('本机新增第19单与官网18单的其他修改可以合并',()=>{
 const base=content(Array.from({length:18},(_,i)=>order('单'+i,{summary:'原简介'})));
 const local=structuredClone(base);local.orders.unshift(order('第19单',{image:'assets/uploads/detail.jpg'}));
 const remote=structuredClone(base);remote.orders[0].summary='官网新简介';
 const result=merge(base,local,remote);
 assert.equal(result.orders.length,19);assert.equal(result.orders.find(o=>o.id==='单0').summary,'官网新简介');
 assert.equal(result.orders.find(o=>o.id==='第19单').image,'assets/uploads/detail.jpg');
});
test('同一单子的不同字段可合并',()=>{
 const base=content([order('单',{price:100,summary:'简介'})]);
 const local=content([order('单',{price:200,summary:'简介'})]);
 const remote=content([order('单',{price:100,summary:'新简介'})]);
 const result=merge(base,local,remote).orders[0];assert.equal(result.price,200);assert.equal(result.summary,'新简介');
});
test('同一字段被两边不同修改时阻止写入并指出单子',()=>{
 const base=content([order('单',{price:100})]);
 assert.throws(()=>merge(base,content([order('单',{price:200})]),content([order('单',{price:300})])),e=>e.code==='CONTENT_CONFLICT'&&e.message.includes('单（价格）'));
});
test('删除与另一边编辑冲突，不能静默删掉内容',()=>{
 const base=content([order('单',{price:100})]);
 assert.throws(()=>merge(base,content([]),content([order('单',{price:200})])),e=>e.code==='CONTENT_CONFLICT');
 assert.equal(merge(base,content([]),base).orders.length,0);
});
test('保留官网独立新增单子和本机下架修改',()=>{
 const base=content([order('单')]);const local=content([order('单',{active:false})]);
 const remote=content([order('官网新单'),order('单')]);const result=merge(base,local,remote);
 assert.equal(result.orders.length,2);assert.equal(result.orders.find(o=>o.id==='单').active,false);
});
test('首页与客服不同图片可以合并，输入内容不被修改',()=>{
 const base=content([order('单')],{contactImage:'a'});const local=content([order('单')],{contactImage:'a',heroImageOne:'b'});const remote=content([order('单')],{contactImage:'c'});
 const before=JSON.stringify(local);const result=merge(base,local,remote);
 assert.equal(result.settings.contactImage,'c');assert.equal(result.settings.heroImageOne,'b');assert.equal(JSON.stringify(local),before);
});
test('重开后台后使用保存的旧基准仍能安全合并',()=>{
 const old=content([order('单',{price:100,summary:'旧'})]);
 const draft=JSON.parse(JSON.stringify({baseline:old,orders:[order('单',{price:200,summary:'旧'})]}));
 const now=content([order('单',{price:100,summary:'官网新'})]);
 assert.equal(merge(draft.baseline,content(draft.orders),now).orders[0].summary,'官网新');
});
test('重复ID被拒绝',()=>{assert.throws(()=>merge(content([]),content([order('a'),order('a')]),content([])),/重复/)});
function apiHarness(remote,{race=false}={}){
 const writes=[];const data=Buffer.from(JSON.stringify(remote)).toString('base64');let blob=0;
 const c=harness(async(url,opts)=>{
  const path=String(url).split('/zhuzhugameclub/')[1];const method=opts.method;const body=opts.body&&JSON.parse(opts.body);
  if(method!=='GET')writes.push({path,method,body});
  let result={};let status=200;
  if(path==='git/ref/heads/main')result={object:{sha:'head'}};
  else if(path==='git/commits/head')result={tree:{sha:'tree'}};
  else if(path.startsWith('contents/'))result={content:data};
  else if(path==='git/blobs')result={sha:'blob'+(++blob)};
  else if(path==='git/trees')result={sha:'nextTree'};
  else if(path==='git/commits')result={sha:'nextCommit'};
  else if(path==='git/refs/heads/main'&&race){status=422;result={message:'Update is not a fast forward'}};
  return {ok:status===200,status,json:async()=>result};
 });return {c,writes};
}
test('完整发布：图片单独上传、合并后一次提交，成功后才返回',async()=>{
 const base=content([order('已有单',{summary:'原简介'})]);const remote=content([order('已有单',{summary:'最新官网简介'})]);
 const image='data:image/png;base64,'+Buffer.from('fake image fixture').toString('base64');
 const {c,writes}=apiHarness(remote);const status=[];
 const result=await c.publishContent({token:'fixture',orders:[order('新单',{image,coverImage:image}),...base.orders],settings:{},baseline:base,status:t=>status.push(t)});
 assert.equal(result.orders.length,2);assert.equal(result.orders.find(o=>o.id==='已有单').summary,'最新官网简介');
 assert.match(result.orders[0].image,/^assets\/uploads\/[a-f0-9]+\.png$/);
 assert.equal(writes.filter(x=>x.path==='git/blobs').length,1);
 const tree=writes.find(x=>x.path==='git/trees').body;const json=tree.tree.find(x=>x.path==='data/content.json').content;assert.ok(!json.includes('data:image/'));
 assert.equal(writes.at(-1).body.force,false);assert.ok(status.some(t=>t.includes('合并')));
});
test('真正冲突时零写入；发布中有人更新时不会强制覆盖',async()=>{
 const base=content([order('单',{price:100})]);const h=apiHarness(content([order('单',{price:300})]));
 await assert.rejects(h.c.publishContent({token:'fixture',orders:[order('单',{price:200})],settings:{},baseline:base,status:()=>{}}),e=>e.code==='CONTENT_CONFLICT');assert.equal(h.writes.length,0);
 const race=apiHarness(base,{race:true});await assert.rejects(race.c.publishContent({token:'fixture',orders:[order('单',{price:200})],settings:{},baseline:base,status:()=>{}}),/422/);assert.equal(race.writes.at(-1).body.force,false);
});
