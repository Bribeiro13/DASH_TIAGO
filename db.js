// ── Supabase DB Layer ──────────────────────────────────────────────────────
const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

function mapFromDB(r) {
  return {
    id: r.id, file_id: r.file_id,
    maquina: r.maquina || '', data: r.data || '', dataRaw: r.data || '',
    duracao: parseFloat(r.duracao) || 0, atividades: r.atividades || 'Sim',
    oms: r.oms || '', bloqueio: parseFloat(r.bloqueio) || 0,
    manutencao: parseFloat(r.manutencao) || 0, desbloqueio: parseFloat(r.desbloqueio) || 0,
    testes: parseFloat(r.testes) || 0, esperaTestes: parseFloat(r.espera_testes) || 0,
    motivo: r.motivo || '', observacoes: r.observacoes || '',
  };
}

function mapToDB(rec) {
  return {
    maquina: rec.maquina, data: rec.dataRaw || rec.data || null,
    duracao: parseFloat(rec.duracao) || 0, atividades: rec.atividades,
    oms: rec.oms || null, bloqueio: parseFloat(rec.bloqueio) || 0,
    manutencao: parseFloat(rec.manutencao) || 0, desbloqueio: parseFloat(rec.desbloqueio) || 0,
    testes: parseFloat(rec.testes) || 0, espera_testes: parseFloat(rec.esperaTestes) || 0,
    motivo: rec.motivo || null, observacoes: rec.observacoes || null,
  };
}

async function dbLoadAll() {
  const [recsRes, filesRes] = await Promise.all([
    db.from('records').select('*').order('created_at', { ascending: true }),
    db.from('imported_files').select('*').order('imported_at', { ascending: false }),
  ]);
  if (recsRes.error) throw recsRes.error;
  if (filesRes.error) throw filesRes.error;
  return { records: (recsRes.data || []).map(mapFromDB), files: filesRes.data || [] };
}

async function dbInsertRecord(rec) {
  const { data, error } = await db.from('records').insert(mapToDB(rec)).select().single();
  if (error) throw error;
  return mapFromDB(data);
}

async function dbUpdateRecord(id, rec) {
  const { error } = await db.from('records').update(mapToDB(rec)).eq('id', id);
  if (error) throw error;
}

async function dbDeleteRecord(id) {
  const { error } = await db.from('records').delete().eq('id', id);
  if (error) throw error;
}

async function dbDeleteMachine(name) {
  const { error } = await db.from('records').delete().eq('maquina', name);
  if (error) throw error;
}

async function dbImportFile(fileInfo, rows) {
  const { data: fileData, error: fileErr } = await db
    .from('imported_files')
    .insert({ filename: fileInfo.name, row_count: rows.length, file_size: fileInfo.size })
    .select().single();
  if (fileErr) throw fileErr;
  if (rows.length) {
    const { error: recErr } = await db.from('records').insert(
      rows.map(r => ({ ...mapToDB(r), file_id: fileData.id }))
    );
    if (recErr) throw recErr;
  }
  return fileData;
}

async function dbDeleteImportedFile(id) {
  const { error } = await db.from('imported_files').delete().eq('id', id);
  if (error) throw error;
}
