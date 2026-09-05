(function(){
  const DB_NAME = 'vault_db';
  const STORE = 'files';
  let db;

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const idb = req.result;
        if(!idb.objectStoreNames.contains(STORE)){
          idb.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function tx(mode){ return db.transaction(STORE, mode).objectStore(STORE); }
  function getAll(){
    return new Promise((resolve, reject) => {
      const req = tx('readonly').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function put(item){
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  function del(id){
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  const categories = [
    {id:'all', label:'All items', icon:'ti-layout-grid'},
    {id:'Images', label:'Images', icon:'ti-photo'},
    {id:'Documents', label:'Documents', icon:'ti-file-text'},
    {id:'Videos', label:'Videos', icon:'ti-video'},
    {id:'Other', label:'Other', icon:'ti-folder'},
  ];
  let currentCat = 'all';
  let items = [];
  let searchTerm = '';

  const navEl = document.getElementById('nav');
  const gridEl = document.getElementById('grid');
  const emptyEl = document.getElementById('empty');
  const searchEl = document.getElementById('search');
  const fileInput = document.getElementById('file-input');
  const overlay = document.getElementById('overlay');
  const modalBody = document.getElementById('modal-body');
  const sectionTitle = document.getElementById('section-title');

  function categoryFor(type){
    if(type.startsWith('image/')) return 'Images';
    if(type.startsWith('video/')) return 'Videos';
    if(type.includes('pdf') || type.startsWith('text/') || type.includes('document') || type.includes('sheet') || type.includes('presentation')) return 'Documents';
    return 'Other';
  }
  function iconFor(type){
    if(type.includes('pdf')) return 'ti-file-type-pdf';
    if(type.startsWith('text/')) return 'ti-file-text';
    if(type.startsWith('video/')) return 'ti-video';
    if(type.startsWith('audio/')) return 'ti-file-music';
    return 'ti-file';
  }
  function fmtSize(b){
    if(b < 1024) return b + ' B';
    if(b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
    return (b/(1024*1024)).toFixed(1) + ' MB';
  }

  function renderNav(){
    navEl.innerHTML = '';
    categories.forEach(c => {
      const count = c.id === 'all' ? items.length : items.filter(i => i.category === c.id).length;
      const div = document.createElement('div');
      div.className = 'nav-item' + (currentCat === c.id ? ' active' : '');
      div.innerHTML = '<i class="ti '+c.icon+'" aria-hidden="true"></i><span>'+c.label+'</span><span class="count">'+count+'</span>';
      div.onclick = () => { currentCat = c.id; sectionTitle.textContent = c.label; renderGrid(); renderNav(); };
      navEl.appendChild(div);
    });
  }

  function renderStats(){
    document.getElementById('stat-total').textContent = items.length;
    document.getElementById('stat-images').textContent = items.filter(i=>i.category==='Images').length;
    document.getElementById('stat-docs').textContent = items.filter(i=>i.category==='Documents').length;
    document.getElementById('stat-other').textContent = items.filter(i=>i.category==='Other'||i.category==='Videos').length;
    const total = items.reduce((a,i)=>a+i.size,0);
    document.getElementById('storage-text').textContent = (total/(1024*1024)).toFixed(1) + ' MB';
    document.getElementById('storage-fill').style.width = Math.min(100,(total/(1024*1024*1024))*100) + '%';
  }

  function renderGrid(){
    let list = currentCat === 'all' ? items : items.filter(i => i.category === currentCat);
    if(searchTerm) list = list.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
    gridEl.innerHTML = '';
    emptyEl.style.display = list.length === 0 ? 'flex' : 'none';
    gridEl.style.display = list.length === 0 ? 'none' : 'block';
    list.sort((a,b)=>b.createdAt-a.createdAt).forEach(it => {
      const card = document.createElement('div');
      card.className = 'card';
      let thumb;
      if(it.category === 'Images'){
        thumb = '<div class="thumb"><img src="'+it.data+'" alt=""/></div>';
      } else {
        thumb = '<div class="thumb icon"><i class="ti '+iconFor(it.type)+'" aria-hidden="true"></i></div>';
      }
      card.innerHTML = thumb + '<div class="meta"><div class="name">'+it.name+'</div><div class="sub">'+fmtSize(it.size)+'</div></div>';
      card.onclick = () => openPreview(it);
      gridEl.appendChild(card);
    });
  }

  function closeModal(){ overlay.style.display = 'none'; modalBody.innerHTML=''; }

  function openPreview(it){
    overlay.style.display = 'flex';
    let preview = it.category === 'Images'
      ? '<img src="'+it.data+'" alt=""/>'
      : '<div class="icon-preview"><i class="ti '+iconFor(it.type)+'" aria-hidden="true"></i></div>';
    modalBody.innerHTML = preview +
      '<h3>'+it.name+'</h3>' +
      '<div class="sub">'+fmtSize(it.size)+' &middot; '+it.category+'</div>' +
      '<div class="actions">' +
      '<button class="btn" id="m-download"><i class="ti ti-download" aria-hidden="true"></i>Download</button>' +
      '<button class="btn danger" id="m-delete"><i class="ti ti-trash" aria-hidden="true"></i>Delete</button>' +
      '<button class="btn" id="m-close"><i class="ti ti-x" aria-hidden="true"></i></button>' +
      '</div>';
    document.getElementById('m-close').onclick = closeModal;
    document.getElementById('m-download').onclick = () => {
      const a = document.createElement('a'); a.href = it.data; a.download = it.name; a.click();
    };
    document.getElementById('m-delete').onclick = async () => {
      await del(it.id);
      items = items.filter(x => x.id !== it.id);
      closeModal(); renderNav(); renderGrid(); renderStats();
    };
  }

  function readAsDataURL(file){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function handleFiles(fileList){
    for(const file of Array.from(fileList)){
      const data = await readAsDataURL(file);
      const item = {
        id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2,9),
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        category: categoryFor(file.type || ''),
        data: data,
        createdAt: Date.now()
      };
      await put(item);
      items.push(item);
    }
    renderNav(); renderGrid(); renderStats();
  }

  document.getElementById('btn-upload').onclick = () => fileInput.click();
  fileInput.onchange = (e) => { handleFiles(e.target.files); fileInput.value=''; };
  searchEl.oninput = (e) => { searchTerm = e.target.value; renderGrid(); };

  const dropTarget = document.body;
  dropTarget.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropzone-active'); });
  dropTarget.addEventListener('dragleave', (e) => { if(e.target === document.body) document.body.classList.remove('dropzone-active'); });
  dropTarget.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dropzone-active');
    if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
  overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });

  (async function init(){
    db = await openDB();
    items = await getAll();
    renderNav(); renderGrid(); renderStats();
  })();
})();
