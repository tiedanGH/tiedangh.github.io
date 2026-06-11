// Projects — project management data layer (localStorage only, no DOM).
const GlotProjects = (() => {
    const TOKEN_KEY    = 'cr_apiKey';
    const PROJECTS_KEY = 'cr_projects';
    const REQUEST_KEY  = 'cr_request';
    const SCHEMA       = 1;
    const DEFAULT_ID   = 'default';
    const DEFAULT_NAME = '默认项目';
    const MAX_NAME_LEN = 60;

    // Per-project fields (everything saved per project; the apiKey is shared, stored separately).
    const PROJECT_FIELDS = ['language', 'codeSource', 'codeUrl', 'code', 'stdin', 'outputFormat', 'storageOption'];
    const DEFAULTS = {
        language: '', codeSource: 'textarea', codeUrl: '', code: '',
        stdin: '', outputFormat: 'text', storageOption: 'disabled'
    };
    const STORAGE_OPTIONS = ['enabled', 'disabled'];

    /* ------------------------ shared token ------------------------ */
    function loadToken() {
        let raw;
        try { raw = localStorage.getItem(TOKEN_KEY); } catch (e) { return ''; }
        return raw ? GlotUtils.decrypt(raw) : '';   // decrypt returns '' on failure
    }
    function saveToken(plain) {
        try {
            if (plain) localStorage.setItem(TOKEN_KEY, GlotUtils.encrypt(plain));
            else localStorage.removeItem(TOKEN_KEY);
        } catch (e) { console.warn('保存 Token 失败:', e); }
    }

    /* ------------------ request config (method + docker) ------------------ */
    function loadRequestConfig() {
        let raw;
        try { raw = localStorage.getItem(REQUEST_KEY); } catch (e) { raw = null; }
        let obj = {};
        try { obj = raw ? JSON.parse(raw) : {}; } catch (e) { obj = {}; }
        return {
            method: obj.method === 'docker' ? 'docker' : 'glot',
            dockerUrl: typeof obj.dockerUrl === 'string' ? obj.dockerUrl : '',
            dockerToken: obj.dockerToken ? GlotUtils.decrypt(obj.dockerToken) : ''   // decrypt returns '' on failure
        };
    }
    function saveRequestConfig(cfg) {
        cfg = cfg || {};
        const out = {
            method: cfg.method === 'docker' ? 'docker' : 'glot',
            dockerUrl: String(cfg.dockerUrl || ''),
            dockerToken: cfg.dockerToken ? GlotUtils.encrypt(String(cfg.dockerToken)) : ''
        };
        try { localStorage.setItem(REQUEST_KEY, JSON.stringify(out)); }
        catch (e) { console.warn('保存请求配置失败:', e); }
    }

    /* ------------------------ helpers ------------------------ */
    function _blankProject(name) {
        return Object.assign({}, DEFAULTS, { name: name, updatedAt: Date.now() });
    }
    function _freshStore() {
        const store = { version: SCHEMA, activeId: DEFAULT_ID, projects: {} };
        store.projects[DEFAULT_ID] = _blankProject(DEFAULT_NAME);
        return store;
    }
    function _clampName(name, fallback) {
        name = (name === undefined || name === null) ? '' : String(name).trim();
        if (!name) name = fallback;
        return name.length > MAX_NAME_LEN ? name.slice(0, MAX_NAME_LEN) : name;
    }
    // Coerce any legacy/foreign storageOption (e.g. "not-implemented") to a valid toggle value.
    function _normStorageOption(v) { return STORAGE_OPTIONS.indexOf(v) === -1 ? 'disabled' : v; }
    // For UNTRUSTED data (import / legacy migration): whitelist-read known fields ONLY,
    // so any apiKey / token / unknown key is dropped and can never enter storage.
    function _sanitizeProject(obj, fallbackName) {
        obj = (obj && typeof obj === 'object') ? obj : {};
        const p = {};
        PROJECT_FIELDS.forEach(f => {
            p[f] = (obj[f] !== undefined && obj[f] !== null) ? String(obj[f]) : DEFAULTS[f];
        });
        p.storageOption = _normStorageOption(p.storageOption);
        p.name = _clampName(obj.name, fallbackName);
        p.updatedAt = Date.now();
        return p;
    }
    // For TRUSTED stored data: fill missing canonical fields but KEEP extra fields
    // (forward-compatible with the upcoming storage phase). Mutates and returns cur.
    function _normalizeProject(cur, fallbackName) {
        cur = (cur && typeof cur === 'object') ? cur : {};
        PROJECT_FIELDS.forEach(f => {
            cur[f] = (cur[f] !== undefined && cur[f] !== null) ? String(cur[f]) : DEFAULTS[f];
        });
        cur.storageOption = _normStorageOption(cur.storageOption);
        cur.name = _clampName(cur.name, fallbackName);
        if (typeof cur.updatedAt !== 'number') cur.updatedAt = Date.now();
        return cur;
    }
    function _genId(store) {
        let id;
        do {
            id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        } while (id === DEFAULT_ID || (store.projects && store.projects[id]));
        return id;
    }
    function _ensureValid(store) {
        if (!store || typeof store !== 'object' || !store.projects || typeof store.projects !== 'object') {
            return _freshStore();
        }
        if (!store.projects[DEFAULT_ID]) store.projects[DEFAULT_ID] = _blankProject(DEFAULT_NAME);
        Object.keys(store.projects).forEach(id => {
            const fallback = id === DEFAULT_ID ? DEFAULT_NAME : '项目';
            store.projects[id] = _normalizeProject(store.projects[id], fallback);
        });
        store.projects[DEFAULT_ID].name = DEFAULT_NAME;   // default name is fixed
        if (!store.activeId || !store.projects[store.activeId]) store.activeId = DEFAULT_ID;
        store.version = SCHEMA;
        return store;
    }
    function _readStore() {
        let raw;
        try { raw = localStorage.getItem(PROJECTS_KEY); } catch (e) { return _freshStore(); }
        if (!raw) return _freshStore();
        try { return _ensureValid(JSON.parse(raw)); }
        catch (e) { console.warn('cr_projects 解析失败，已重建:', e); return _freshStore(); }
    }
    function _writeStore(store) {
        try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(store)); }
        catch (e) { console.warn('保存项目失败:', e); }
    }
    function _allNames(store, exceptId) {
        return Object.keys(store.projects)
            .filter(id => id !== exceptId)
            .map(id => store.projects[id].name);
    }
    // "name" -> "name(2)" -> "name(3)" ... against all current names.
    function _uniqueName(base, store, exceptId) {
        base = _clampName(base, '项目');
        const names = _allNames(store, exceptId);
        if (names.indexOf(base) === -1) return base;
        let n = 2;
        while (names.indexOf(base + '(' + n + ')') !== -1) n++;
        return base + '(' + n + ')';
    }
    function _projectExport(p) {
        const out = {};
        PROJECT_FIELDS.forEach(f => { out[f] = p[f]; });   // whitelist: no token, no extras
        out.name = p.name;
        return out;
    }

    /* ------------------------ public API ------------------------ */
    function init() {
        let raw;
        try { raw = localStorage.getItem(PROJECTS_KEY); } catch (e) { raw = null; }
        if (raw) { _writeStore(_readStore()); return; }     // normalize + version-stamp existing
        _writeStore(_freshStore());                         // first run: start with a fresh default project
    }
    function list() {
        const store = _readStore();
        return Object.keys(store.projects).map(id => ({
            id: id, name: store.projects[id].name,
            isDefault: id === DEFAULT_ID, updatedAt: store.projects[id].updatedAt || 0
        })).sort((a, b) => {
            if (a.isDefault) return -1;
            if (b.isDefault) return 1;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
    }
    function getActiveId() { return _readStore().activeId; }
    function getProject(id) {
        const p = _readStore().projects[id];
        if (!p) return null;
        const out = { name: p.name };
        PROJECT_FIELDS.forEach(f => { out[f] = p[f]; });
        return out;
    }
    function setActive(id) {
        const store = _readStore();
        if (!store.projects[id]) return false;
        store.activeId = id; _writeStore(store); return true;
    }
    function saveProjectData(id, fields) {
        const store = _readStore();
        if (!store.projects[id]) return false;
        const p = store.projects[id];
        PROJECT_FIELDS.forEach(f => {
            if (fields && fields[f] !== undefined && fields[f] !== null) p[f] = String(fields[f]);
        });
        p.updatedAt = Date.now();
        _writeStore(store); return true;
    }
    function create(name) {
        const store = _readStore();
        const id = _genId(store);
        store.projects[id] = _blankProject(_uniqueName(name, store, null));
        _writeStore(store); return id;       // does NOT change activeId (caller switches)
    }
    function rename(id, newName) {
        const store = _readStore();
        if (!store.projects[id]) return { ok: false, error: '项目不存在' };
        if (id === DEFAULT_ID) return { ok: false, error: '默认项目不可重命名' };
        const name = _uniqueName(newName, store, id);
        store.projects[id].name = name;
        store.projects[id].updatedAt = Date.now();
        _writeStore(store); return { ok: true, name: name };
    }
    function duplicate(id) {
        const store = _readStore();
        const src = store.projects[id];
        if (!src) return null;
        const newId = _genId(store);
        const copy = {};
        PROJECT_FIELDS.forEach(f => { copy[f] = src[f]; });
        copy.name = _uniqueName(src.name, store, null);
        copy.updatedAt = Date.now();
        store.projects[newId] = copy;
        _writeStore(store); return newId;    // does NOT change activeId
    }
    function remove(id) {
        const store = _readStore();
        if (id === DEFAULT_ID) return { ok: false, error: '默认项目不可删除', newActiveId: store.activeId };
        if (!store.projects[id]) return { ok: false, error: '项目不存在', newActiveId: store.activeId };
        delete store.projects[id];
        if (store.activeId === id) store.activeId = DEFAULT_ID;
        _writeStore(store); return { ok: true, newActiveId: store.activeId };
    }
    function exportOne(id) {
        const store = _readStore();
        if (id === DEFAULT_ID) return { ok: false, error: '默认项目不可导出，请先复制一个项目再导出' };
        const p = store.projects[id];
        if (!p) return { ok: false, error: '项目不存在' };
        const payload = { schema: SCHEMA, kind: 'cr-project', exportedAt: Date.now(), project: _projectExport(p) };
        return { ok: true, json: JSON.stringify(payload, null, 2), name: p.name };
    }
    function exportAll() {
        const store = _readStore();
        const projects = Object.keys(store.projects)
            .filter(id => id !== DEFAULT_ID)              // default never exported
            .map(id => _projectExport(store.projects[id]));
        const payload = { schema: SCHEMA, kind: 'cr-projects', exportedAt: Date.now(), projects: projects };
        return { ok: true, json: JSON.stringify(payload, null, 2), count: projects.length };
    }
    function importOne(parsed) {
        if (!parsed || typeof parsed !== 'object' || parsed.kind !== 'cr-project' || !parsed.project) {
            return { ok: false, error: '文件格式不正确（应为单个项目导出文件）' };
        }
        const store = _readStore();
        const p = _sanitizeProject(parsed.project, '导入项目');   // strips any token/unknown key
        p.name = _uniqueName(p.name, store, null);
        const id = _genId(store);
        store.projects[id] = p;
        _writeStore(store); return { ok: true, id: id, name: p.name };
    }
    // Deep copy of the whole store (for full backup). includeDefault=false omits the default project.
    // cr_projects never holds the token, so the snapshot is token-free by construction.
    function snapshot(includeDefault) {
        const store = JSON.parse(JSON.stringify(_readStore()));
        if (includeDefault === false) delete store.projects[DEFAULT_ID];
        return store;
    }
    // FULL REPLACE from a store object (cr-full import).
    // The CURRENT default project is kept untouched — imports never replace or reset it.
    function replaceAllFull(storeObj) {
        const currentDefault = _readStore().projects[DEFAULT_ID];
        const store = _ensureValid(storeObj && typeof storeObj === 'object' ? JSON.parse(JSON.stringify(storeObj)) : _freshStore());
        store.projects[DEFAULT_ID] = currentDefault;
        _writeStore(store);
        return { ok: true };
    }
    // FULL REPLACE from a legacy cr-projects array: discard existing, rebuild on a fresh store.
    function replaceAllFromArray(arr) {
        const currentDefault = _readStore().projects[DEFAULT_ID];
        const store = _freshStore();
        store.projects[DEFAULT_ID] = currentDefault;   // default 维持原样
        const added = [];
        (Array.isArray(arr) ? arr : []).forEach(entry => {
            const p = _sanitizeProject(entry, '导入项目');
            p.name = _uniqueName(p.name, store, null);
            const id = _genId(store);
            store.projects[id] = p;
            added.push({ id: id, name: p.name });
        });
        _writeStore(store);
        return { ok: true, added: added };
    }

    return {
        init, list, getActiveId, getProject, setActive, saveProjectData,
        create, rename, duplicate, remove, exportOne, exportAll, importOne,
        snapshot, replaceAllFull, replaceAllFromArray,
        loadToken, saveToken, loadRequestConfig, saveRequestConfig, DEFAULT_ID
    };
})();
