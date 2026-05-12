// ── STATE ───────────────────────────────────────────────────────────────────
let allRecords = [];
let importedFiles = [];
let importedRows = [], importedHeaders = [];
let chartTend, chartGauge, chartRanking, chartStacked;

// ── UTILS ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  if (typeof d === 'number') {
    const dt = new Date(Math.round((d - 25569) * 86400 * 1000));
    return dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }
  if (typeof d === 'string') {
    if (d.includes('T')) d = d.split('T')[0];
    if (d.includes('-')) { const [y,m,day] = d.split('-'); return `${day}/${m}`; }
    return d;
  }
  return '—';
}
function num(v) { return parseFloat(v) || 0; }

function fmtDuration(hours) {
  const h = Number(hours);
  if (h > 0 && h < 1) return Math.round(h * 60) + ' min';
  return h.toFixed(1).replace('.0', '') + ' h';
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  setTimeout(() => { t.className = 'toast'; }, 3500);
}

function setConnected(ok) {
  const dot = document.getElementById('connDot');
  if (dot) { dot.className = 'conn-dot ' + (ok ? 'ok' : 'err'); dot.title = ok ? 'Conectado ao Supabase' : 'Sem conexão'; }
}

function escAttr(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

// ── CUSTOM CONFIRM DIALOG ────────────────────────────────────────────────────
let _confirmCallback = null;

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  _confirmCallback = onConfirm;
  document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  _confirmCallback = null;
}

document.getElementById('confirmOk').addEventListener('click', async () => {
  if (_confirmCallback) {
    const cb = _confirmCallback;
    _confirmCallback = null;
    closeConfirm();
    await cb();
  } else {
    closeConfirm();
  }
});
document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
document.getElementById('confirmOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeConfirm();
});

// ── LOAD DATA ───────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const result = await dbLoadAll();
    allRecords = result.records;
    importedFiles = result.files;
    setConnected(true);
  } catch(e) {
    setConnected(false);
    showToast('Erro Supabase: ' + e.message, 'error');
  }
}

// ── FILTERS ─────────────────────────────────────────────────────────────────
function getFiltered() {
  const m = document.getElementById('filterMachine').value.toLowerCase();
  const s = document.getElementById('filterStatus').value.toLowerCase();
  return allRecords.filter(r => {
    const okM = !m || (r.maquina||'').toLowerCase() === m;
    const okS = !s || (r.atividades||'').toLowerCase() === s;
    return okM && okS;
  });
}

function updateMachineFilter() {
  const sel = document.getElementById('filterMachine');
  const cur = sel.value;
  const machines = [...new Set(allRecords.map(r => r.maquina).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas as máquinas</option>' +
    machines.map(m => `<option value="${m}"${m===cur?' selected':''}>${m}</option>`).join('');
}

// ── KPIs ────────────────────────────────────────────────────────────────────
function updateKPIs(data) {
  const total = data.length;
  const concluidas = data.filter(r => (r.atividades||'').toLowerCase() === 'sim').length;
  const pct = total ? Math.round(concluidas/total*100) : 0;
  const durations = data.map(r => num(r.duracao));
  const sum = arr => arr.reduce((a,b)=>a+b,0);
  const avg = arr => arr.length ? (sum(arr)/arr.length) : 0;
  
  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiConcluidas').textContent = `${concluidas}/${total} (${pct}%)`;
  document.getElementById('kpiMediaDuracao').textContent = fmtDuration(avg(durations));
  document.getElementById('kpiMediaManutencao').textContent = fmtDuration(avg(data.map(r=>num(r.manutencao))));
  document.getElementById('kpiMediaBloqueio').textContent = fmtDuration(avg(data.map(r=>num(r.bloqueio))));
  document.getElementById('kpiMediaDesbloqueio').textContent = fmtDuration(avg(data.map(r=>num(r.desbloqueio))));
  document.getElementById('kpiMediaTestes').textContent = fmtDuration(avg(data.map(r=>num(r.testes))));
  document.getElementById('kpiOmsPendentes').textContent = data.filter(r=>r.oms&&String(r.oms).trim()&&String(r.oms).trim()!=='—').length;
  document.getElementById('gaugePercent').textContent = pct+'%';
  document.getElementById('legendConcluidas').textContent = `Concluídas ${pct}%`;
  document.getElementById('legendPendentes').textContent = `Pendentes ${100-pct}%`;
  if (chartGauge) { chartGauge.data.datasets[0].data=[pct,100-pct]; chartGauge.update(); }
}

// ── CHARTS ──────────────────────────────────────────────────────────────────
function truncLabel(s, max=14) { return s&&s.length>max ? s.slice(0,max)+'…' : s; }

function buildCharts() {
  const c1 = document.getElementById('chartTendencia').getContext('2d');
  chartTend = new Chart(c1, {
    type:'line', data:{labels:[],datasets:[{label:'Duração(h)',data:[],borderColor:'#4dabf7',backgroundColor:'rgba(77,171,247,.1)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:'#4dabf7',tension:0.35,fill:true}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:10},maxRotation:45,minRotation:30,autoSkip:true,maxTicksLimit:14},grid:{display:false}},y:{ticks:{font:{size:11}},grid:{color:'#f0f2f7'}}}}
  });
  const c2 = document.getElementById('chartGauge').getContext('2d');
  chartGauge = new Chart(c2, {
    type:'doughnut', data:{datasets:[{data:[0,100],backgroundColor:['#51cf66','#ff6b6b'],borderWidth:0,circumference:180,rotation:270}]},
    options:{responsive:true,maintainAspectRatio:true,cutout:'72%',plugins:{legend:{display:false},tooltip:{enabled:false}}}
  });
  const c3 = document.getElementById('chartRanking').getContext('2d');
  chartRanking = new Chart(c3, {
    type:'bar', data:{labels:[],datasets:[{label:'Bloqueio',data:[],backgroundColor:'#4dabf7'},{label:'Manutenção',data:[],backgroundColor:'#fd7e14'},{label:'Desbloqueio',data:[],backgroundColor:'#51cf66'},{label:'Testes',data:[],backgroundColor:'#ff6b6b'}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{stacked:true,grid:{color:'#f0f2f7'},ticks:{font:{size:11}}},y:{stacked:true,grid:{display:false},ticks:{font:{size:11},callback:function(v){return truncLabel(this.getLabelForValue(v),18);}}}}}
  });
  const c4 = document.getElementById('chartStacked').getContext('2d');
  chartStacked = new Chart(c4, {
    type:'bar', data:{labels:[],datasets:[{label:'Bloqueio',data:[],backgroundColor:'#4dabf7'},{label:'Manutenção',data:[],backgroundColor:'#51cf66'},{label:'Desbloqueio',data:[],backgroundColor:'#fd7e14'},{label:'Testes',data:[],backgroundColor:'#ff6b6b'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{stacked:true,grid:{display:false},ticks:{font:{size:10},maxRotation:45,minRotation:30,autoSkip:false,callback:function(v){return truncLabel(this.getLabelForValue(v),12);}}},y:{stacked:true,grid:{color:'#f0f2f7'},ticks:{font:{size:11}}}}}
  });
}

function updateCharts(data) {
  if (!chartTend) return;
  const sorted = [...data].sort((a,b)=>(a.dataRaw||a.data||'')>(b.dataRaw||b.data||'')?1:-1);
  chartTend.data.labels = sorted.map(r=>fmtDate(r.dataRaw||r.data));
  chartTend.data.datasets[0].data = sorted.map(r=>num(r.duracao));
  chartTend.update();
  const mm = {};
  data.forEach(r=>{ const m=r.maquina||'?'; if(!mm[m]) mm[m]={b:0,mn:0,d:0,t:0}; mm[m].b+=num(r.bloqueio); mm[m].mn+=num(r.manutencao); mm[m].d+=num(r.desbloqueio); mm[m].t+=num(r.testes); });
  const srt = Object.entries(mm).sort((a,b)=>((b[1].b+b[1].mn+b[1].d+b[1].t)-(a[1].b+a[1].mn+a[1].d+a[1].t)));
  const lbl = srt.map(e=>e[0]);
  [chartRanking,chartStacked].forEach(ch=>{ ch.data.labels=lbl; ch.data.datasets[0].data=srt.map(e=>e[1].b); ch.data.datasets[1].data=srt.map(e=>e[1].mn); ch.data.datasets[2].data=srt.map(e=>e[1].d); ch.data.datasets[3].data=srt.map(e=>e[1].t); ch.update(); });
}

// ── TABLE ───────────────────────────────────────────────────────────────────
function renderTable(data) {
  const tbody = document.getElementById('tableBody');
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="empty-icon">📋</span><p>Nenhum registro encontrado.<br>Importe um arquivo XLSX/CSV ou adicione manualmente.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => {
    const isPend = (r.atividades||'').toLowerCase()==='não'||(r.atividades||'').toLowerCase()==='nao';
    return `<tr class="${isPend?'row-pending':''}">
      <td class="td-machine">${r.maquina||'—'}</td>
      <td>${fmtDate(r.dataRaw||r.data)}</td>
      <td class="td-duration">${fmtDuration(r.duracao)}</td>
      <td><span class="badge badge-${isPend?'nao':'sim'}">${r.atividades||'Sim'}</span></td>
      <td class="td-oms">${r.oms||'—'}</td>
      <td class="td-motivo">${r.motivo||'—'}</td>
      <td class="td-obs">${r.observacoes||'—'}</td>
      <td><div class="td-actions">
        <button class="action-btn" data-action="edit-record" data-id="${r.id}" title="Editar">✏️</button>
        <button class="action-btn delete" data-action="delete-record" data-id="${r.id}" title="Excluir">🗑️</button>
      </div></td></tr>`;
  }).join('');
}

// Event delegation for table actions
document.getElementById('tableBody').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'edit-record') openModal(id);
  if (btn.dataset.action === 'delete-record') {
    showConfirm('Excluir este registro?', 'Essa ação não pode ser desfeita.', async () => {
      try {
        await dbDeleteRecord(id);
        allRecords = allRecords.filter(r => r.id !== id);
        refresh(); showToast('Registro excluído.', 'error');
      } catch(ex) { showToast('Erro: ' + ex.message, 'error'); }
    });
  }
});

function refresh() {
  const data = getFiltered();
  updateKPIs(data); updateCharts(data); renderTable(data); updateMachineFilter();
}

// ── RECORD FORM ──────────────────────────────────────────────────────────────
function getFormData() {
  const dataVal = document.getElementById('fData').value;
  return {
    maquina: document.getElementById('fMaquina').value.trim(),
    data: dataVal, dataRaw: dataVal,
    duracao: num(document.getElementById('fDuracao').value),
    atividades: document.getElementById('fAtividades').value === 'sim' ? 'Sim' : 'Não',
    oms: document.getElementById('fOms').value.trim(),
    bloqueio: num(document.getElementById('fBloqueio').value),
    manutencao: num(document.getElementById('fManutencao').value),
    desbloqueio: num(document.getElementById('fDesbloqueio').value),
    testes: num(document.getElementById('fTestes').value),
    esperaTestes: num(document.getElementById('fEsperaTestes').value),
    motivo: document.getElementById('fMotivo').value.trim(),
    observacoes: document.getElementById('fObservacoes').value.trim(),
  };
}

function openModal(id = null) {
  document.getElementById('editId').value = id || '';
  document.getElementById('modalTitle').textContent = id ? 'Editar Registro' : 'Novo Registro';
  if (id) {
    const r = allRecords.find(x => x.id === id);
    if (!r) return;
    document.getElementById('fMaquina').value = r.maquina;
    document.getElementById('fData').value = r.dataRaw || r.data || '';
    document.getElementById('fDuracao').value = r.duracao;
    document.getElementById('fAtividades').value = (r.atividades||'sim').toLowerCase() === 'sim' ? 'sim' : 'nao';
    document.getElementById('fOms').value = r.oms;
    document.getElementById('fBloqueio').value = r.bloqueio;
    document.getElementById('fManutencao').value = r.manutencao;
    document.getElementById('fDesbloqueio').value = r.desbloqueio;
    document.getElementById('fTestes').value = r.testes;
    document.getElementById('fEsperaTestes').value = r.esperaTestes;
    document.getElementById('fMotivo').value = r.motivo;
    document.getElementById('fObservacoes').value = r.observacoes;
  } else {
    document.getElementById('recordForm').reset();
    ['fBloqueio','fManutencao','fDesbloqueio','fTestes','fEsperaTestes'].forEach(fid => document.getElementById(fid).value = 0);
  }
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

document.getElementById('recordForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const rec = getFormData();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    if (id) {
      await dbUpdateRecord(id, rec);
      const idx = allRecords.findIndex(r => r.id === id);
      if (idx >= 0) allRecords[idx] = { ...rec, id };
      showToast('Registro atualizado!', 'success');
    } else {
      const saved = await dbInsertRecord(rec);
      allRecords.push(saved);
      showToast('Registro adicionado!', 'success');
    }
    closeModal(); refresh();
  } catch(ex) { showToast('Erro: ' + ex.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Salvar'; }
});

document.getElementById('btnNovoRegistro').addEventListener('click', () => openModal());
document.getElementById('btnAdicionar').addEventListener('click', () => openModal());
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('btnCancelar').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
document.getElementById('filterMachine').addEventListener('change', refresh);
document.getElementById('filterStatus').addEventListener('change', refresh);

// ── MANAGE MODAL ─────────────────────────────────────────────────────────────
function openManageModal() {
  renderManageModal();
  document.getElementById('manageOverlay').classList.add('open');
}
function closeManageModal() { document.getElementById('manageOverlay').classList.remove('open'); }

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tabFiles').classList.toggle('hidden', tab !== 'files');
  document.getElementById('tabMachines').classList.toggle('hidden', tab !== 'machines');
}

function renderManageModal() {
  // Arquivos
  const filesHtml = importedFiles.length
    ? importedFiles.map(f => `
        <div class="manage-item">
          <div class="manage-item-info">
            <span class="manage-item-name">📄 ${f.filename}</span>
            <span class="manage-item-meta">${new Date(f.imported_at).toLocaleString('pt-BR')} &nbsp;·&nbsp; ${f.row_count} registro(s)${f.file_size?' &nbsp;·&nbsp; '+f.file_size:''}</span>
          </div>
          <button class="action-btn delete"
            data-action="delete-file"
            data-id="${escAttr(f.id)}"
            data-name="${escAttr(f.filename)}"
            data-count="${f.row_count}"
            title="Excluir arquivo e registros">🗑️</button>
        </div>`).join('')
    : '<p class="manage-empty">Nenhum arquivo importado ainda.</p>';

  // Máquinas
  const mm = {};
  allRecords.forEach(r => { if(r.maquina) mm[r.maquina] = (mm[r.maquina]||0)+1; });
  const machinesHtml = Object.keys(mm).length
    ? Object.entries(mm).sort((a,b)=>a[0].localeCompare(b[0])).map(([m,c]) => `
        <div class="manage-item">
          <div class="manage-item-info">
            <span class="manage-item-name">🔧 ${m}</span>
            <span class="manage-item-meta">${c} registro(s)</span>
          </div>
          <button class="action-btn delete"
            data-action="delete-machine"
            data-name="${escAttr(m)}"
            data-count="${c}"
            title="Excluir máquina e todos os seus registros">🗑️</button>
        </div>`).join('')
    : '<p class="manage-empty">Nenhuma máquina cadastrada.</p>';

  document.getElementById('filesList').innerHTML = filesHtml;
  document.getElementById('machinesList').innerHTML = machinesHtml;
}

// Event delegation para botões do modal de gerenciamento
document.getElementById('manageOverlay').addEventListener('click', e => {
  // Fechar ao clicar no overlay
  if (e.target === document.getElementById('manageOverlay')) { closeManageModal(); return; }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const name   = btn.dataset.name;
  const count  = btn.dataset.count;

  if (action === 'delete-file') {
    const id = btn.dataset.id;
    showConfirm(
      `Excluir arquivo "${name}"?`,
      `${count} registro(s) importado(s) deste arquivo serão removidos permanentemente.`,
      async () => {
        btn.disabled = true; btn.textContent = '⏳';
        try {
          await dbDeleteImportedFile(id);
          await loadData(); refresh(); renderManageModal();
          showToast('Arquivo e registros excluídos!', 'success');
        } catch(ex) {
          showToast('Erro: ' + ex.message, 'error');
          btn.disabled = false; btn.textContent = '🗑️';
        }
      }
    );
  }

  if (action === 'delete-machine') {
    showConfirm(
      `Excluir máquina "${name}"?`,
      `${count} registro(s) vinculado(s) a esta máquina serão removidos permanentemente.`,
      async () => {
        btn.disabled = true; btn.textContent = '⏳';
        try {
          await dbDeleteMachine(name);
          await loadData(); refresh(); renderManageModal();
          showToast(`Máquina "${name}" excluída!`, 'success');
        } catch(ex) {
          showToast('Erro: ' + ex.message, 'error');
          btn.disabled = false; btn.textContent = '🗑️';
        }
      }
    );
  }
});

document.getElementById('btnGerenciar').addEventListener('click', openManageModal);
document.getElementById('manageClose').addEventListener('click', closeManageModal);
document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// ── FILE IMPORT ───────────────────────────────────────────────────────────────
const FIELD_LABELS = {
  maquina:'Máquina', data:'Data', duracao:'Duração (h)', atividades:'Atividades',
  oms:'OMS Pendentes', 
  bloqIni:'Horário inicial de bloqueio da máquina', 
  bloqFim:'Horário final de bloqueio da máquina',
  manutIni:'Horário inicial das atividades de manutenção', 
  manutFim:'Horário Final das atividades de manutenção',
  desbIni:'Horário inicial de desbloqueio da máquina para operação', 
  desbFim:'Horário final de desbloqueio da máquina para operação',
  testesIni:'Horário que o responsável acionou para testes', 
  testesFim:'Horário de finalização dos testes e entrega da máquina',
  esperaTestes:'Espera Testes (min)',
  motivo:'Motivo', observacoes:'Observações',
};

function autoGuess(headers, key) {
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const kw = { 
    maquina:['maquina','machine','equipamento'], data:['data','date','dia'],
    duracao:['duracao','duration','horas','tempo'], atividades:['atividade','concluida','status'],
    oms:['oms','ordem','os','pendente'], 
    bloqIni:['horarioinicialdebloqueio','inicialdebloqueio','iniciobloqueio'], 
    bloqFim:['horariofinaldebloqueio','finaldebloqueio','fimbloqueio'],
    manutIni:['horarioinicialdasatividades','horarioinicialatividades','inicialdemanutencao','iniciomanutencao'], 
    manutFim:['horariofinaldasatividades','horariofinalatividades','finaldemanutencao','fimmanutencao'],
    desbIni:['horarioinicialdedesbloqueio','inicialdedesbloqueio','iniciodesbloqueio'], 
    desbFim:['horariofinaldedesbloqueio','finaldedesbloqueio','fimdesbloqueio'],
    testesIni:['responsavelacionou','responsavelpela','acionouparaoperacao','iniciotestes'], 
    testesFim:['finalizacaodostestes','fimtestes'],
    esperaTestes:['espera','waiting'],
    motivo:['motivo','reason','causa'], observacoes:['obs','observ','nota','comment'],
  };
  return headers.find(h => {
    const n = norm(h);
    return (kw[key]||[]).some(k => n.includes(k));
  }) || '';
}

function diffHours(start, end) {
  if (start === '' || end === '' || start == null || end == null) return 0;
  const parseTime = (val) => {
    if (typeof val === 'number') return val * 24;
    if (val instanceof Date) return val.getHours() + val.getMinutes() / 60 + val.getSeconds() / 3600;
    if (typeof val === 'string') {
      const match = val.match(/(\d{1,2}):(\d{2})/);
      if (match) return parseInt(match[1], 10) + parseInt(match[2], 10) / 60;
    }
    return null;
  };
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null) return 0;
  let diff = e - s;
  if (diff < 0) diff += 24; // Cross midnight
  return Number(diff.toFixed(2));
}

function openImportModal(headers, rows, fileName, fileSize) {
  importedHeaders = headers; importedRows = rows;
  document.getElementById('importFileName').textContent = '📄 ' + fileName;
  document.getElementById('importRowCount').textContent = `${rows.length} linha(s)`;
  document.getElementById('columnMapping').innerHTML = Object.entries(FIELD_LABELS).map(([key,label]) => {
    const g = autoGuess(headers, key);
    return `<div class="map-row"><label>${label}</label><select id="map_${key}"><option value="">— ignorar —</option>${headers.map(h=>`<option value="${h}"${h===g?' selected':''}>${h}</option>`).join('')}</select></div>`;
  }).join('');
  const prev = rows.slice(0,5);
  document.getElementById('previewTableWrapper').innerHTML = `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${prev.map(row=>`<tr>${headers.map(h=>`<td>${row[h]??''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  document.getElementById('importOverlay').dataset.fileName = fileName;
  document.getElementById('importOverlay').dataset.fileSize = fileSize;
  document.getElementById('importOverlay').classList.add('open');
}

function closeImportModal() { document.getElementById('importOverlay').classList.remove('open'); }
document.getElementById('importClose').addEventListener('click', closeImportModal);
document.getElementById('importCancel').addEventListener('click', closeImportModal);
document.getElementById('importOverlay').addEventListener('click', e => { if(e.target===e.currentTarget) closeImportModal(); });

document.getElementById('importConfirm').addEventListener('click', async () => {
  const mapping = {};
  Object.keys(FIELD_LABELS).forEach(key => { const s = document.getElementById('map_'+key); if(s&&s.value) mapping[key]=s.value; });
  const rows = importedRows.map(row => {
    const rec = {};
    Object.entries(mapping).forEach(([f,col]) => { rec[f] = row[col]!==undefined?row[col]:''; });
    if (!String(rec.maquina).trim()) return null;
    
    rec.bloqueio = diffHours(rec.bloqIni, rec.bloqFim);
    rec.manutencao = diffHours(rec.manutIni, rec.manutFim);
    rec.desbloqueio = diffHours(rec.desbIni, rec.desbFim);
    rec.testes = diffHours(rec.testesIni, rec.testesFim);
    
    rec.duracao = num(rec.duracao); 
    rec.esperaTestes = num(rec.esperaTestes);
    rec.dataRaw = rec.data || '';
    
    const low = String(rec.atividades||'').toLowerCase().trim();
    rec.atividades = (low==='sim'||low==='yes'||low==='1'||low==='true') ? 'Sim' : (low===''?'Sim':'Não');
    
    // Cleanup keys that aren't needed in DB
    ['bloqIni','bloqFim','manutIni','manutFim','desbIni','desbFim','testesIni','testesFim'].forEach(k => delete rec[k]);
    
    return rec;
  }).filter(Boolean);
  if (!rows.length) { showToast('Nenhum registro válido (coluna Máquina vazia?).', 'error'); return; }
  const btn = document.getElementById('importConfirm');
  btn.disabled = true; btn.textContent = 'Importando…';
  try {
    const overlay = document.getElementById('importOverlay');
    await dbImportFile({ name: overlay.dataset.fileName, size: overlay.dataset.fileSize }, rows);
    await loadData(); refresh();
    closeImportModal(); showToast(`${rows.length} registro(s) importado(s)!`, 'success');
  } catch(ex) { showToast('Erro ao importar: ' + ex.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Importar dados'; }
});

document.getElementById('fileInput').addEventListener('change', function() {
  const file = this.files[0]; if (!file) return;
  const sizeStr = file.size>1024*1024?(file.size/1024/1024).toFixed(1)+' MB':Math.round(file.size/1024)+' KB';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval:'', raw:false });
      if (!json.length) { showToast('Arquivo vazio!', 'error'); return; }
      openImportModal(Object.keys(json[0]), json, file.name, sizeStr);
    } catch(err) { showToast('Erro ao ler: ' + err.message, 'error'); }
    this.value = '';
  };
  reader.readAsArrayBuffer(file);
});

// ── INIT ─────────────────────────────────────────────────────────────────────
buildCharts();
loadData().then(() => refresh());
