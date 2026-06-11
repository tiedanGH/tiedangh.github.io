// Store — storage feature data layer (localStorage only, no DOM).
// Depends on GlotProjects (loaded earlier): reads per-project storageOption + project snapshot/replace.
const GlotStore = (() => {
    const STORAGE_KEY  = 'cr_storage';    // per-project global + per-user storage + bucket links
    const BUCKETS_KEY  = 'cr_buckets';    // cross-project buckets + 3 backup slots each
    const ENV_KEY      = 'cr_env';        // per-field mock-identity libraries (shared across projects)
    const RECOVERY_KEY = 'cr_recovery';   // import-conflict set-aside; NEVER exported
    const SCHEMA       = 1;
    const BACKUP_SLOTS = 3;
    const DEFAULT_USER = 10001;           // matches JsonStorage defaults (JsonProcessor.kt:130-142)

    // platformID is NOT a configurable field — it is auto-derived as `<platform>_<userID>` (see composeEnvValues).
    const ENV_FIELDS = ['userID', 'nickname', 'from', 'platform', 'avatar'];
    const ENV_DEFAULTS = {
        userID:   { values: ['10001'],                  current: '10001' },
        nickname: { values: ['测试用户'],                current: '测试用户' },
        from:     { values: ['private', '测试群聊(114514)'], current: 'private' },
        platform: { values: ['qq', 'kook'],             current: 'qq' },
        avatar:   { values: [''],                       current: '' }
    };

    /* ------------------------ low-level read/write ------------------------ */
    function _clone(o) { return JSON.parse(JSON.stringify(o)); }
    function _read(key) {
        let raw;
        try { raw = localStorage.getItem(key); } catch (e) { return null; }
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { console.warn(key + ' 解析失败，已重建:', e); return null; }
    }
    // Returns {ok, error}; surfaces quota failures instead of losing data silently.
    function _write(key, obj) {
        try { localStorage.setItem(key, JSON.stringify(obj)); return { ok: true }; }
        catch (e) {
            console.warn('保存 ' + key + ' 失败:', e);
            const quota = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
            return { ok: false, error: quota ? '本地存储空间不足' : ('保存失败：' + (e.message || e)) };
        }
    }

    /* ------------------------ cr_storage ------------------------ */
    function _freshStorage() { return { version: SCHEMA, projects: {} }; }
    function _ensureStorage(s) {
        if (!s || typeof s !== 'object' || typeof s.projects !== 'object' || !s.projects) return _freshStorage();
        s.version = SCHEMA;
        Object.keys(s.projects).forEach(pid => {
            const p = s.projects[pid] && typeof s.projects[pid] === 'object' ? s.projects[pid] : {};
            p.global  = (typeof p.global === 'string') ? p.global : '';
            p.storage = (p.storage && typeof p.storage === 'object' && !Array.isArray(p.storage)) ? p.storage : {};
            Object.keys(p.storage).forEach(uid => { p.storage[uid] = String(p.storage[uid]); });
            p.links   = Array.isArray(p.links) ? p.links.map(Number).filter(n => !isNaN(n)) : [];
            s.projects[pid] = p;
        });
        return s;
    }
    function _readStorage() { return _ensureStorage(_read(STORAGE_KEY)); }
    function _writeStorage(s) { return _write(STORAGE_KEY, s); }
    function _projectEntry(s, pid) {
        if (!s.projects[pid]) s.projects[pid] = { global: '', storage: {}, links: [] };
        return s.projects[pid];
    }

    function getProjectStorage(pid) {
        const s = _readStorage();
        const p = s.projects[pid] || { global: '', storage: {}, links: [] };
        return { global: p.global || '', storage: Object.assign({}, p.storage), links: (p.links || []).slice() };
    }
    function getGlobal(pid) { return getProjectStorage(pid).global; }
    function setGlobal(pid, v) {
        const s = _readStorage();
        _projectEntry(s, pid).global = String(v == null ? '' : v);
        return _writeStorage(s);
    }
    function getUserStorage(pid, uid) {
        const s = _readStorage();
        const p = s.projects[pid];
        return (p && p.storage && p.storage[String(uid)] != null) ? String(p.storage[String(uid)]) : '';
    }
    // v === '' DELETES the user's entry (faithful to StorageManager.kt:85); otherwise sets it.
    function setUserStorage(pid, uid, v) {
        const s = _readStorage();
        const p = _projectEntry(s, pid);
        const key = String(uid);
        if (v === '' || v == null) delete p.storage[key];
        else p.storage[key] = String(v);
        return _writeStorage(s);
    }
    function setLinks(pid, ids) {
        const s = _readStorage();
        _projectEntry(s, pid).links = (ids || []).map(Number).filter(n => !isNaN(n));
        return _writeStorage(s);
    }
    function linkBucket(pid, id) {
        id = Number(id);
        if (!getBucket(id)) return { ok: false, error: '存储库不存在' };
        const s = _readStorage();
        const p = _projectEntry(s, pid);
        if (p.links.indexOf(id) !== -1) return { ok: false, error: '该存储库已关联' };
        p.links.push(id);
        return Object.assign({ ok: true }, _writeStorage(s));
    }
    function unlinkBucket(pid, id) {
        id = Number(id);
        const s = _readStorage();
        const p = _projectEntry(s, pid);
        const i = p.links.indexOf(id);
        if (i === -1) return { ok: false, error: '未关联此存储库' };
        p.links.splice(i, 1);
        return Object.assign({ ok: true }, _writeStorage(s));
    }
    function removeProjectStorage(pid) {
        const s = _readStorage();
        if (s.projects[pid]) { delete s.projects[pid]; _writeStorage(s); }
        return { ok: true };
    }
    function isEnabled(pid) {
        const p = (typeof GlotProjects !== 'undefined') ? GlotProjects.getProject(pid) : null;
        return !!(p && p.storageOption === 'enabled');
    }

    /* ------------------------ cr_buckets ------------------------ */
    function _freshBuckets() { return { version: SCHEMA, buckets: {} }; }
    function _normBackup(b) {
        if (!b || typeof b !== 'object') return null;
        return { name: String(b.name == null ? '' : b.name), time: Number(b.time) || 0, content: String(b.content == null ? '' : b.content) };
    }
    function _normBackups(arr) {
        const out = [];
        for (let i = 0; i < BACKUP_SLOTS; i++) out.push(_normBackup(Array.isArray(arr) ? arr[i] : null));
        return out;
    }
    function _ensureBuckets(s) {
        if (!s || typeof s !== 'object' || typeof s.buckets !== 'object' || !s.buckets) return _freshBuckets();
        s.version = SCHEMA;
        delete s.nextId;   // legacy allocator field; ids are now assigned by _firstFreeId scan
        Object.keys(s.buckets).forEach(k => {
            const id = Number(k);
            const b = s.buckets[k] && typeof s.buckets[k] === 'object' ? s.buckets[k] : {};
            if (b.deleted === true) {
                // 空槽位 (mirrors bot's bucket[id].clear()): keep the id reserved, drop all data
                s.buckets[k] = { id, deleted: true };
                return;
            }
            b.id = id;
            b.name = String(b.name == null ? ('存储库' + id) : b.name);
            b.content = String(b.content == null ? '' : b.content);
            b.desc = String(b.desc == null ? '' : b.desc);
            b.createdAt = Number(b.createdAt) || Date.now();
            b.updatedAt = Number(b.updatedAt) || b.createdAt;
            b.backups = _normBackups(b.backups);
            s.buckets[k] = b;
        });
        return s;
    }
    // A bucket entry that exists and is not an empty slot (空槽位)
    function _liveBucket(s, id) {
        const b = s.buckets[String(Number(id))];
        return (b && !b.deleted) ? b : null;
    }
    // Smallest free id, scanning from 1 (mirrors bot generateSequence(1L){it+1}.first{isBucketEmpty(it)})
    function _firstFreeId(s) {
        let id = 1;
        while (_liveBucket(s, id)) id++;
        return id;
    }
    function _readBuckets() { return _ensureBuckets(_read(BUCKETS_KEY)); }
    function _writeBuckets(s) { return _write(BUCKETS_KEY, s); }
    function _countLinks(id) {
        const s = _readStorage();
        let n = 0;
        Object.keys(s.projects).forEach(pid => { if ((s.projects[pid].links || []).indexOf(Number(id)) !== -1) n++; });
        return n;
    }
    function _nameTaken(store, name, exceptId) {
        return Object.keys(store.buckets).some(k => Number(k) !== exceptId && !store.buckets[k].deleted && store.buckets[k].name === name);
    }
    function _uniqueBucketName(store, base, exceptId) {
        base = String(base == null ? '存储库' : base).trim() || '存储库';
        if (!_nameTaken(store, base, exceptId)) return base;
        let n = 2;
        while (_nameTaken(store, base + '(' + n + ')', exceptId)) n++;
        return base + '(' + n + ')';
    }

    // Includes 空槽位 placeholders as {id, deleted:true} so the UI can render them in place.
    function listBuckets() {
        const s = _readBuckets();
        return Object.keys(s.buckets).map(k => {
            const b = s.buckets[k];
            if (b.deleted) return { id: b.id, deleted: true, linkedCount: 0 };
            return { id: b.id, name: b.name, content: b.content, desc: b.desc,
                     updatedAt: b.updatedAt, backups: _clone(b.backups), linkedCount: _countLinks(b.id) };
        }).sort((a, b) => a.id - b.id);
    }
    // Empty slots behave as nonexistent for the program contract (links/IO/import-conflicts).
    function getBucket(id) {
        const s = _readBuckets();
        const b = _liveBucket(s, id);
        return b ? _clone(b) : null;
    }
    // atId (optional): recreate at a specific empty slot; default = smallest free id (reuses holes).
    function createBucket(name, desc, atId) {
        name = String(name == null ? '' : name).trim();
        if (!name) return { ok: false, error: '请输入存储库名称' };
        if (/^\d+$/.test(name)) return { ok: false, error: '存储库名称不能为纯数字' };
        const s = _readBuckets();
        if (_nameTaken(s, name, -1)) return { ok: false, error: '名称 ' + name + ' 已存在' };
        let id;
        if (atId != null) {
            id = Number(atId);
            if (!Number.isInteger(id) || id < 1) return { ok: false, error: '无效的存储库编号' };
            if (_liveBucket(s, id)) return { ok: false, error: '编号 ' + id + ' 已被占用' };
        } else {
            id = _firstFreeId(s);
        }
        s.buckets[String(id)] = { id, name, content: '', desc: String(desc || ''), createdAt: Date.now(), updatedAt: Date.now(), backups: _normBackups(null) };
        const w = _writeBuckets(s);
        return w.ok ? { ok: true, id } : { ok: false, error: w.error };
    }
    // Create a bucket at a SPECIFIC id (import path). Name made unique.
    function _createBucketWithId(s, id, name, content, desc) {
        id = Number(id);
        s.buckets[String(id)] = {
            id, name: _uniqueBucketName(s, name, id), content: String(content == null ? '' : content),
            desc: String(desc || ''), createdAt: Date.now(), updatedAt: Date.now(), backups: _normBackups(null)
        };
    }
    function renameBucket(id, name) {
        id = Number(id);
        name = String(name == null ? '' : name).trim();
        if (!name) return { ok: false, error: '请输入存储库名称' };
        if (/^\d+$/.test(name)) return { ok: false, error: '存储库名称不能为纯数字' };
        const s = _readBuckets();
        const b = _liveBucket(s, id);
        if (!b) return { ok: false, error: '存储库不存在' };
        if (_nameTaken(s, name, id)) return { ok: false, error: '名称 ' + name + ' 已存在' };
        b.name = name;
        b.updatedAt = Date.now();
        return Object.assign({ ok: true, name }, _writeBuckets(s));
    }
    function setBucketDesc(id, desc) {
        const s = _readBuckets();
        const b = _liveBucket(s, id);
        if (!b) return { ok: false, error: '存储库不存在' };
        b.desc = String(desc == null ? '' : desc); b.updatedAt = Date.now();
        return Object.assign({ ok: true }, _writeBuckets(s));
    }
    function setBucketContent(id, content) {
        const s = _readBuckets();
        const b = _liveBucket(s, id);
        if (!b) return { ok: false, error: '存储库不存在' };
        b.content = String(content == null ? '' : content); b.updatedAt = Date.now();
        return Object.assign({ ok: true }, _writeBuckets(s));
    }
    // Delete keeps the id reserved as an empty slot (mirrors bot bucket[id].clear()); recreate reuses it.
    function deleteBucket(id) {
        id = Number(id);
        const s = _readBuckets();
        if (!_liveBucket(s, id)) return { ok: false, error: '存储库不存在' };
        s.buckets[String(id)] = { id, deleted: true };
        const w = _writeBuckets(s);
        if (!w.ok) return { ok: false, error: w.error };
        // cascade: unlink from every project
        const st = _readStorage();
        let changed = false;
        Object.keys(st.projects).forEach(pid => {
            const links = st.projects[pid].links || [];
            const i = links.indexOf(id);
            if (i !== -1) { links.splice(i, 1); changed = true; }
        });
        if (changed) _writeStorage(st);
        return { ok: true };
    }

    /* ------------------------ bucket backups (3 slots) ------------------------ */
    function _slotOk(slot) { return Number.isInteger(slot) && slot >= 0 && slot < BACKUP_SLOTS; }
    // Save current content into an EMPTY slot. If occupied, returns {occupied, existing} for 2nd-confirm.
    function createBackup(id, slot) {
        if (!_slotOk(slot)) return { ok: false, error: '备份编号仅支持 1-' + BACKUP_SLOTS };
        const s = _readBuckets();
        const b = _liveBucket(s, id);
        if (!b) return { ok: false, error: '存储库不存在' };
        if (b.content === '') return { ok: false, error: '存储库主内容为空，无需备份' };
        if (b.backups[slot]) return { ok: false, occupied: true, existing: _clone(b.backups[slot]) };
        b.backups[slot] = { name: '备份' + (slot + 1), time: Date.now(), content: b.content };
        return Object.assign({ ok: true }, _writeBuckets(s));
    }
    // Overwrite an (occupied or empty) slot with current content — called after 2nd-confirm.
    function overwriteBackup(id, slot) {
        if (!_slotOk(slot)) return { ok: false, error: '备份编号仅支持 1-' + BACKUP_SLOTS };
        const s = _readBuckets();
        const b = _liveBucket(s, id);
        if (!b) return { ok: false, error: '存储库不存在' };
        if (b.content === '') return { ok: false, error: '存储库主内容为空，无需备份' };
        const old = b.backups[slot];
        b.backups[slot] = { name: (old && old.name) || ('备份' + (slot + 1)), time: Date.now(), content: b.content };
        return Object.assign({ ok: true }, _writeBuckets(s));
    }
    function deleteBackup(id, slot) {
        if (!_slotOk(slot)) return { ok: false, error: '备份编号仅支持 1-' + BACKUP_SLOTS };
        const s = _readBuckets();
        const b = _liveBucket(s, id);
        if (!b) return { ok: false, error: '存储库不存在' };
        if (!b.backups[slot]) return { ok: false, error: '槽位 ' + (slot + 1) + ' 中没有备份' };
        b.backups[slot] = null;
        return Object.assign({ ok: true }, _writeBuckets(s));
    }
    function renameBackup(id, slot, name) {
        if (!_slotOk(slot)) return { ok: false, error: '备份编号仅支持 1-' + BACKUP_SLOTS };
        const s = _readBuckets();
        const b = _liveBucket(s, id);
        if (!b || !b.backups[slot]) return { ok: false, error: '槽位没有备份' };
        b.backups[slot].name = String(name == null ? '' : name).trim() || ('备份' + (slot + 1));
        return Object.assign({ ok: true }, _writeBuckets(s));
    }
    // Restore slot content into main content. Does NOT auto-backup current (faithful to bot). Caller does 2nd-confirm.
    function rollbackBackup(id, slot) {
        if (!_slotOk(slot)) return { ok: false, error: '备份编号仅支持 1-' + BACKUP_SLOTS };
        const s = _readBuckets();
        const b = _liveBucket(s, id);
        if (!b) return { ok: false, error: '存储库不存在' };
        if (!b.backups[slot]) return { ok: false, error: '备份编号 ' + (slot + 1) + ' 没有任何数据' };
        b.content = b.backups[slot].content; b.updatedAt = Date.now();
        return Object.assign({ ok: true }, _writeBuckets(s));
    }

    /* ------------------------ cr_env (per-field libraries) ------------------------ */
    function _freshEnv() { return { version: SCHEMA, fields: _clone(ENV_DEFAULTS), images: [] }; }
    function _ensureEnv(s) {
        if (!s || typeof s !== 'object' || typeof s.fields !== 'object' || !s.fields) return _freshEnv();
        const fields = {};   // rebuild with ONLY ENV_FIELDS (drops legacy platformID / unknown keys)
        ENV_FIELDS.forEach(f => {
            const cur = s.fields[f] && typeof s.fields[f] === 'object' ? s.fields[f] : {};
            let vals = Array.isArray(cur.values) ? cur.values.map(v => String(v == null ? '' : v)) : null;
            if (!vals || !vals.length) vals = ENV_DEFAULTS[f].values.slice();
            // de-dup preserving order
            vals = vals.filter((v, i) => vals.indexOf(v) === i);
            let current = String(cur.current == null ? '' : cur.current);
            if (vals.indexOf(current) === -1) current = vals[0];
            fields[f] = { values: vals, current };
        });
        // images: uploaded attachment base64 (no URL — there is no image host); {name,base64}
        const images = Array.isArray(s.images)
            ? s.images.map(im => ({ name: String((im && im.name) || ''), base64: String((im && im.base64) || '') })).filter(im => im.base64)
            : [];
        return { version: SCHEMA, fields, images };
    }
    function _readEnv() { return _ensureEnv(_read(ENV_KEY)); }
    function _writeEnv(s) { return _write(ENV_KEY, s); }
    function getEnv() { return _readEnv(); }
    function getEnvField(f) { return _readEnv().fields[f] || null; }
    function addEnvValue(f, v) {
        if (ENV_FIELDS.indexOf(f) === -1) return { ok: false, error: '未知字段' };
        v = String(v == null ? '' : v);
        const s = _readEnv();
        if (s.fields[f].values.indexOf(v) === -1) s.fields[f].values.push(v);
        s.fields[f].current = v;
        return Object.assign({ ok: true }, _writeEnv(s));
    }
    function deleteEnvValue(f, v) {
        if (ENV_FIELDS.indexOf(f) === -1) return { ok: false, error: '未知字段' };
        v = String(v == null ? '' : v);
        const s = _readEnv();
        const vals = s.fields[f].values;
        if (vals.length <= 1) return { ok: false, error: '至少保留一个候选值' };
        const i = vals.indexOf(v);
        if (i === -1) return { ok: false, error: '候选值不存在' };
        vals.splice(i, 1);
        if (s.fields[f].current === v) s.fields[f].current = vals[0];
        return Object.assign({ ok: true }, _writeEnv(s));
    }
    function setEnvCurrent(f, v) {
        if (ENV_FIELDS.indexOf(f) === -1) return { ok: false, error: '未知字段' };
        v = String(v == null ? '' : v);
        const s = _readEnv();
        if (s.fields[f].values.indexOf(v) === -1) return { ok: false, error: '候选值不存在' };
        s.fields[f].current = v;
        return Object.assign({ ok: true }, _writeEnv(s));
    }
    function composeEnvValues() {
        const f = _readEnv().fields;
        const userID = f.userID.current;
        const platform = f.platform.current;
        return {
            userID: userID,
            // matches bot getUserPlatformID: qq → raw userID, otherwise <platform>_<userID>
            platformID: (platform && platform !== 'qq') ? (platform + '_' + userID) : userID,
            nickname: f.nickname.current, avatar: f.avatar.current,
            from: f.from.current, platform: platform
        };
    }
    // Image-input attachments (base64 only — no image host, so url stays empty).
    function getEnvImages() { return (_readEnv().images || []).slice(); }
    function addEnvImage(name, base64) {
        const s = _readEnv();
        s.images.push({ name: String(name || 'image'), base64: String(base64 || '') });
        return Object.assign({ ok: true }, _writeEnv(s));
    }
    function removeEnvImage(index) {
        const s = _readEnv();
        if (index < 0 || index >= s.images.length) return { ok: false, error: '图片不存在' };
        s.images.splice(index, 1);
        return Object.assign({ ok: true }, _writeEnv(s));
    }
    function clearEnvImages() {
        const s = _readEnv(); s.images = [];
        return Object.assign({ ok: true }, _writeEnv(s));
    }

    /* ------------------------ cr_recovery (never exported) ------------------------ */
    function _freshRecovery() { return { version: SCHEMA, items: [] }; }
    function _ensureRecovery(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return _freshRecovery();
        s.version = SCHEMA;
        return s;
    }
    function _readRecovery() { return _ensureRecovery(_read(RECOVERY_KEY)); }
    function _writeRecovery(s) { return _write(RECOVERY_KEY, s); }
    function listRecovery() { return _readRecovery().items.slice().reverse(); }   // newest first
    function pushRecovery(kind, source, data) {
        const s = _readRecovery();
        const rid = 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        s.items.push({ rid, kind: String(kind || 'bucket'), source: String(source || ''), createdAt: Date.now(), data: _clone(data) });
        _writeRecovery(s);
        return rid;
    }
    function deleteRecovery(rid) {
        const s = _readRecovery();
        const i = s.items.findIndex(it => it.rid === rid);
        if (i === -1) return { ok: false, error: '记录不存在' };
        s.items.splice(i, 1);
        return Object.assign({ ok: true }, _writeRecovery(s));
    }
    function clearRecovery() { return Object.assign({ ok: true }, _writeRecovery(_freshRecovery())); }
    // 复制到存储库: write a recovery item's content into a target bucket's main content.
    function applyRecoveryToBucket(rid, targetId) {
        const s = _readRecovery();
        const it = s.items.find(x => x.rid === rid);
        if (!it) return { ok: false, error: '记录不存在' };
        const content = it.data && it.data.content != null ? String(it.data.content) : '';
        return setBucketContent(targetId, content);
    }

    /* ------------------------ I/O contract (the heart) ------------------------ */
    // Build the JsonStorage first line (field order/defaults match JsonProcessor.kt:130-142).
    function buildStorageInput(pid) {
        const ps = getProjectStorage(pid);
        const env = composeEnvValues();
        const userID = Number(env.userID) || DEFAULT_USER;
        return JSON.stringify({
            global: ps.global || '',
            storage: getUserStorage(pid, String(userID)) || '',
            bucket: ps.links.map(id => { const b = getBucket(id); return { id, name: b ? b.name : '', content: b ? b.content : '' }; }),
            userID,
            platformID: env.platformID || String(userID),
            nickname: env.nickname || '',
            avatar: env.avatar || '',
            from: env.from || '',
            platform: env.platform || '',
            images: (_readEnv().images || []).map(im => ({ url: '', base64: im.base64, error: '' }))
        });
    }
    // Mirror StorageManager.savePastebinStorage + saveBucketData. Returns {ok, errors:[]}.
    // null/undefined field = unchanged; global '' clears; storage '' deletes active user's entry.
    function applyStorageOutput(pid, parsed) {
        const errors = [];
        if (!parsed) return { ok: true, errors };
        const g = parsed.global, st = parsed.storage, bk = parsed.bucket;
        if ((g == null) && (st == null) && (bk == null)) return { ok: true, errors };

        if (g != null) { const r = setGlobal(pid, String(g)); if (!r.ok) errors.push('[global] ' + r.error); }
        if (st != null) {
            const userID = String(Number(composeEnvValues().userID) || DEFAULT_USER);
            const r = setUserStorage(pid, userID, String(st) === '' ? '' : String(st));
            if (!r.ok) errors.push('[storage] ' + r.error);
        }
        if (Array.isArray(bk)) {
            const links = getProjectStorage(pid).links;
            const seen = {};
            bk.forEach((data, index) => {
                const n = index + 1;
                const id = (data && data.id != null) ? Number(data.id) : null;
                if (id == null || isNaN(id)) {
                    errors.push('[(' + n + ')无效ID] 未指定目标存储库ID');
                } else if (links.indexOf(id) === -1) {
                    errors.push('[(' + n + ')拒绝访问] 当前项目未关联存储库 ' + id);
                } else if (seen[id]) {
                    errors.push('[(' + n + ')重复写入] 检测到对存储库 ' + id + ' 的重复保存，单次输出仅支持写入同一存储库一次');
                } else if (data.content != null) {
                    const r = setBucketContent(id, String(data.content));
                    if (!r.ok) errors.push('[(' + n + ')保存失败] ' + r.error);
                    else seen[id] = true;
                }
            });
        }
        return { ok: errors.length === 0, errors };
    }

    /* ------------------------ import / export ------------------------ */
    // Single-project storage export: linked buckets' CURRENT content, NO backups.
    function exportProjectStorage(pid) {
        const ps = getProjectStorage(pid);
        return {
            global: ps.global || '',
            storage: Object.assign({}, ps.storage),
            links: ps.links.slice(),
            buckets: ps.links.map(id => { const b = getBucket(id); return b ? { id: b.id, name: b.name, content: b.content } : null; }).filter(Boolean)
        };
    }
    // Which imported bucket ids already exist locally (conflict candidates).
    function planStorageConflicts(payload) {
        if (!payload || !Array.isArray(payload.buckets)) return [];
        return payload.buckets.map(b => Number(b.id)).filter(id => !isNaN(id) && getBucket(id));
    }
    // Apply an imported project's storage to newPid. overwrite controls bucket-id conflict resolution.
    // Conflicting data is moved to the recovery area (old content if overwrite, new data if not).
    function applyStorageImport(newPid, payload, overwrite) {
        if (!payload || typeof payload !== 'object') return { ok: true };
        setGlobal(newPid, payload.global || '');
        if (payload.storage && typeof payload.storage === 'object') {
            Object.keys(payload.storage).forEach(uid => setUserStorage(newPid, uid, String(payload.storage[uid])));
        }
        const s = _readBuckets();
        const linkIds = [];
        (payload.buckets || []).forEach(b => {
            const id = Number(b.id);
            if (isNaN(id)) return;
            const existing = _liveBucket(s, id);   // 空槽位 counts as free
            if (!existing) {
                _createBucketWithId(s, id, b.name, b.content);
            } else if (overwrite) {
                pushRecovery('bucket', '导入冲突：被覆盖的旧数据 (' + existing.name + ' id=' + id + ')',
                    { id, name: existing.name, content: existing.content });
                existing.content = String(b.content == null ? '' : b.content);
                existing.updatedAt = Date.now();
            } else {
                pushRecovery('bucket', '导入冲突：未采用的新数据 (' + (b.name || '') + ' id=' + id + ')',
                    { id, name: b.name, content: b.content });
            }
            linkIds.push(id);
        });
        _writeBuckets(s);
        const uniq = linkIds.filter((v, i) => linkIds.indexOf(v) === i);
        setLinks(newPid, uniq);
        return { ok: true };
    }

    // Full snapshot for backup / restore. includeStorage adds storage/buckets; includeDefault keeps the default project.
    // NEVER includes cr_recovery, cr_env (模拟环境 has its own import/export) or the API token.
    function buildFullExport(opts) {
        opts = opts || {};
        const out = { schema: SCHEMA, kind: 'cr-full', exportedAt: Date.now() };
        out.projects = GlotProjects.snapshot(opts.includeDefault !== false);
        if (opts.includeStorage) {
            const storage = _clone(_readStorage());
            if (opts.includeDefault === false && GlotProjects.DEFAULT_ID) delete storage.projects[GlotProjects.DEFAULT_ID];
            out.storage = storage;
            out.buckets = _clone(_readBuckets());
        }
        return out;
    }
    // FULL REPLACE: projects + storage/buckets from parsed. cr_recovery and cr_env untouched
    // (legacy cr-full files may carry an env field — deliberately ignored). Missing sections reset to fresh.
    function fullReplace(parsed) {
        parsed = parsed || {};
        GlotProjects.replaceAllFull(parsed.projects);
        _writeStorage(_ensureStorage(parsed.storage || _freshStorage()));
        _writeBuckets(_ensureBuckets(parsed.buckets || _freshBuckets()));
        return { ok: true };
    }

    // 模拟环境 config has its own import/export, fully separate from project/storage files.
    function exportEnvConfig() {
        return { ok: true, json: JSON.stringify({ schema: SCHEMA, kind: 'cr-env', exportedAt: Date.now(), env: _clone(_readEnv()) }, null, 2) };
    }
    function importEnvConfig(parsed) {
        if (!parsed || typeof parsed !== 'object' || parsed.kind !== 'cr-env' || !parsed.env || typeof parsed.env !== 'object') {
            return { ok: false, error: '文件格式不正确（应为模拟环境配置导出文件）' };
        }
        const w = _writeEnv(_ensureEnv(parsed.env));
        return w.ok ? { ok: true } : { ok: false, error: w.error };
    }

    /* ------------------------ init ------------------------ */
    function init() {
        _writeStorage(_readStorage());
        _writeBuckets(_readBuckets());
        _writeEnv(_readEnv());
        _writeRecovery(_readRecovery());
    }

    return {
        init, isEnabled,
        // cr_storage
        getProjectStorage, getGlobal, setGlobal, getUserStorage, setUserStorage,
        setLinks, linkBucket, unlinkBucket, removeProjectStorage,
        // cr_buckets
        listBuckets, getBucket, createBucket, renameBucket, setBucketDesc, setBucketContent, deleteBucket,
        createBackup, overwriteBackup, deleteBackup, renameBackup, rollbackBackup,
        // cr_env
        getEnv, getEnvField, addEnvValue, deleteEnvValue, setEnvCurrent, composeEnvValues, ENV_FIELDS,
        getEnvImages, addEnvImage, removeEnvImage, clearEnvImages,
        // cr_recovery
        listRecovery, pushRecovery, deleteRecovery, clearRecovery, applyRecoveryToBucket,
        // I/O contract
        buildStorageInput, applyStorageOutput,
        // import/export
        exportProjectStorage, planStorageConflicts, applyStorageImport, buildFullExport, fullReplace,
        exportEnvConfig, importEnvConfig
    };
})();
