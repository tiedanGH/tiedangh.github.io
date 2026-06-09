
const GlotStorage = (() => {
    function load() {
        const id = GlotProjects.getActiveId();
        const p = GlotProjects.getProject(id) || {};
        return {
            apiKey: GlotProjects.loadToken(),
            language: p.language, codeSource: p.codeSource, codeUrl: p.codeUrl,
            code: p.code, stdin: p.stdin, outputFormat: p.outputFormat, storageOption: p.storageOption
        };
    }
    function save(data) {
        GlotProjects.saveToken(data.apiKey || '');
        GlotProjects.saveProjectData(GlotProjects.getActiveId(), data);
    }
    return { save, load };
})();
