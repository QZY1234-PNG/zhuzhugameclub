/* Content comparison and three-way merge. No credentials are persisted. */
const CONTENT_CATEGORIES = ['老板权益及须知','VIP预存','体验保底单','3×3赛季任务','陪玩单','趣味单合集','航天趣味单','巴克趣味单','监狱趣味单','礼物单'];
function normalizePublishedOrder(order) {
  return {...order, id:order.id || order.title,
    category: CONTENT_CATEGORIES.includes(order.category) ? order.category : '趣味单合集',
    active:order.active !== false, details:Array.isArray(order.details) ? order.details : [],
    image:order.image || '', coverImage:order.coverImage || ''};
}
function normalizePublishedContent(content) {
  if (!content || !Array.isArray(content.orders)) throw Error('单子数据格式不正确，请先导出备份');
  const orders=content.orders.map(normalizePublishedOrder);
  if (new Set(orders.map(o=>o.id)).size !== orders.length || orders.some(o=>!o.id))
    throw Error('有重复或空白的单子编号，请先导出备份并核对单子名称');
  return {schemaVersion:1, orders,
    settings:{heroImageOne:'',heroImageTwo:'',contactImage:'',...(content.settings || {})}};
}
function stableContentValue(value) {
  if (Array.isArray(value)) return '['+value.map(stableContentValue).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableContentValue(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function equalContentValue(a,b) { return stableContentValue(a)===stableContentValue(b); }
function mergePublishedContent(base,local,remote) {
  base=normalizePublishedContent(base);local=normalizePublishedContent(local);remote=normalizePublishedContent(remote);
  const conflicts=[];
  function mergeValue(b,l,r,label,field) {
    if(equalContentValue(l,b)) return r;
    if(equalContentValue(r,b)||equalContentValue(l,r)) return l;
    // Independent edits to fields of the same order can be combined.
    if(b&&l&&r&&[b,l,r].every(v=>typeof v==='object'&&!Array.isArray(v))) {
      const result={};
      for(const key of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])) {
        const value=mergeValue(b[key],l[key],r[key],label,key);
        if(value!==undefined)result[key]=value;
      }
      return result;
    }
    conflicts.push({label,field}); return l;
  }
  const bMap=new Map(base.orders.map(o=>[o.id,o]));
  const lMap=new Map(local.orders.map(o=>[o.id,o]));
  const rMap=new Map(remote.orders.map(o=>[o.id,o]));
  const orders=[];
  for(const id of new Set([...lMap.keys(),...rMap.keys(),...bMap.keys()])) {
    const b=bMap.get(id),l=lMap.get(id),r=rMap.get(id);
    const merged=mergeValue(b,l,r,(l||r||b).title || id,'整条单子');
    if(merged!==undefined)orders.push(merged);
  }
  const settings=mergeValue(base.settings,local.settings,remote.settings,'首页/客服图片','图片设置');
  if(conflicts.length) {
    const names={title:'名称',category:'分类',tag:'标签',price:'价格',priceLabel:'价格文案',summary:'简介',image:'详情图片',coverImage:'封面图片',details:'规则',active:'上架状态',featured:'精选状态',heroImageOne:'主卡片图片',heroImageTwo:'副卡片图片',contactImage:'客服联系图片'};
    const error=Error('同一内容被两边修改：'+conflicts.slice(0,4).map(c=>c.label+'（'+(names[c.field]||c.field)+'）').join('、')+'。草稿未丢失，请导出数据备份后核对；不要清缓存。');
    error.code='CONTENT_CONFLICT';error.conflicts=conflicts;throw error;
  }
  return {schemaVersion:1,orders,settings};
}
/* Publish the merged content and images together in one Git commit. */
async function publishContent({token, orders, settings, baseline, status}) {
  if (!token.trim()) throw Error('请填写仅授权此仓库的 GitHub Token');
  const repo = 'QZY1234-PNG/zhuzhugameclub';
  async function api(path, method = 'GET', body) {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      signal:AbortSignal.timeout(45000),cache:'no-store',
      method, headers: {Accept:'application/vnd.github+json', Authorization:`Bearer ${token.trim()}`, 'Content-Type':'application/json', 'X-GitHub-Api-Version':'2022-11-28'},
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'Token 无效或缺少此仓库的 Contents 读写权限' : `GitHub ${response.status}：${result.message || '请求失败'}`);
    return result;
  }
  status('正在检查仓库最新版本…');
  const head = await api('git/ref/heads/main');
  const commit = await api(`git/commits/${head.object.sha}`);
  const current = await api(`contents/data/content.json?ref=${head.object.sha}`);
  const currentContent = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(current.content.replace(/\s/g,'')), c=>c.charCodeAt(0))));
  const snapshot = JSON.parse(JSON.stringify(mergePublishedContent(baseline,{schemaVersion:1,orders,settings},currentContent)));
  if (!equalContentValue(normalizePublishedContent(currentContent),normalizePublishedContent(baseline))) status('正在合并最新官网内容与本机草稿…');
  const entries = [], seen = new Map();
  async function imageFile(value) {
    if (!value || !value.startsWith('data:')) return value;
    const match = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([\s\S]+)$/.exec(value);
    if (!match) throw Error('图片格式不支持，请使用 PNG、JPG、WebP、GIF 或 SVG');
    const bytes = Uint8Array.from(atob(match[2]), c=>c.charCodeAt(0));
    if (bytes.length > 20*1024*1024) throw Error('单张图片超过 20MB，请压缩后重试');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const ext = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'}[match[1]];
    const path = `assets/uploads/${hash}.${ext}`;
    if (!seen.has(path)) {
      status(`正在上传图片 ${seen.size+1}…`);
      const blob = await api('git/blobs','POST',{content:match[2],encoding:'base64'});
      entries.push({path, mode:'100644', type:'blob', sha:blob.sha});seen.set(path,true);
    }
    return path;
  }
  for (const order of snapshot.orders) for (const key of ['image','coverImage']) order[key]=await imageFile(order[key]||'');
  for (const key of ['heroImageOne','heroImageTwo','contactImage']) snapshot.settings[key]=await imageFile(snapshot.settings[key]||'');
  entries.push({path:'data/content.json',mode:'100644',type:'blob',content:JSON.stringify(snapshot,null,2)});
  status('正在提交内容和图片…');
  const tree = await api('git/trees','POST',{base_tree:commit.tree.sha,tree:entries});
  const next = await api('git/commits','POST',{message:'发布俱乐部单子和图片',tree:tree.sha,parents:[head.object.sha]});
  // Non-fast-forward updates fail safely if another editor publishes during the upload.
  await api('git/refs/heads/main','PATCH',{sha:next.sha,force:false});
  return snapshot;
}

