// 如果不是在 GitHub 域名访问时，修改 info 文本
(function() {
    const githubDomains = ["github.tiedan.site", "page.tiedan.site", "tiedangh.github.io"];
    const host = window.location.hostname.toLowerCase();
    const isGithub = githubDomains.some(domain => host === domain || host.endsWith("." + domain));

    if (!isGithub) {
        window.addEventListener("DOMContentLoaded", function() {
            const info = document.querySelector(".info");
            if (info) {
                info.innerHTML = 'Github Page 备用地址：<a href="https://page.tiedan.site" target="_blank">page.tiedan.site</a>';
            }
        });
    }
})();
