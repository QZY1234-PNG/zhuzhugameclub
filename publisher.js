/* Publish a complete content snapshot with one Git commit. Credentials stay in memory. */
async function publishContent({token, orders, settings, baseline, status}) {
  if (!token.trim()) throw Error('请填写仅授权此仓库的 GitHub Token');
  const repo = 'QZY1234-PNG/zhuzhugameclub';
  async function api(path, method = 'GET', body) {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
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
  if (JSON.stringify(currentContent) !== JSON.stringify(baseline)) throw Error('仓库内容已更新，请导出草稿备份，刷新后台并核对最新内容后重新发布');
  const snapshot = JSON.parse(JSON.stringify({schemaVersion:1, orders, settings}));
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
  // Non-fast-forward updates fail if another editor changed main after our read.
  await api('git/refs/heads/main','PATCH',{sha:next.sha,force:false});
  return snapshot;
}
