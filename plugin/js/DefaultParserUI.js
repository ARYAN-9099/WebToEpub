"use strict";

/** Keep track of how to user tells us to parse different sites */
class DefaultParserSiteSettings {
    constructor() {
        this.communityConfigs = {};
        this.loadSiteConfigs();
    }

    /** @private */
    loadSiteConfigs() {
        let config = window.localStorage.getItem(DefaultParserSiteSettings.storageName);
        this.configs = new Map();
        if (config != null) {
            for (let e of JSON.parse(config)) {
                let selectors = e[1];
                if (DefaultParserSiteSettings.isConfigValid(selectors)) {
                    this.configs.set(e[0], selectors);
                }
            }
        }
    }

    static isConfigValid(selectors) {
        return (selectors.contentCss !== undefined)
            && !util.isNullOrEmpty(selectors.contentCss);
    }

    saveSiteConfig(hostname, contentCss, titleCss, removeCss, testUrl) {
        if (this.isConfigChanged(hostname, contentCss, titleCss, removeCss, testUrl)) {
            this.configs.set(
                hostname, { 
                    contentCss: contentCss, 
                    titleCss: titleCss, 
                    removeCss: removeCss,
                    testUrl: testUrl 
                }
            );
            let serialized = JSON.stringify(Array.from(this.configs.entries()));
            window.localStorage.setItem(DefaultParserSiteSettings.storageName, serialized);
        }
    }

    /** @private */
    isConfigChanged(hostname, contentCss, titleCss, removeCss, testUrl) {
        let config = this.configs.get(hostname);
        return (config === undefined) || 
            (contentCss !== config.contentCss) ||
            (titleCss !== config.titleCss) || 
            (removeCss !== config.removeCss) ||
            (testUrl !== config.testUrl);
    }

    getConfigForSite(hostname) {
        // User's own config takes priority over community configs
        let userConfig = this.configs.get(hostname);
        if (userConfig != null) {
            return userConfig;
        }
        // Fall back to community configs
        return this.getCommunityConfigForSite(hostname);
    }

    getCommunityConfigForSite(hostname) {
        let config = this.communityConfigs[hostname];
        if (config != null && DefaultParserSiteSettings.isConfigValid(config)) {
            return config;
        }
        return null;
    }

    /** Load community configs from the bundled JSON file */
    async loadCommunityConfigs() {
        try {
            let url = chrome.runtime.getURL("defaultParserCommunity.json");
            let response = await fetch(url);
            if (response.ok) {
                let data = await response.json();
                this.communityConfigs = data.configs || {};
                this.communityConfigsLastUpdated = data.last_updated || 0;
            }
        } catch (err) {
            // Bundled file missing or invalid — not fatal
            console.log("Could not load bundled community configs:", err);
        }
    }

    /** Fetch latest community configs from the remote server and merge */
    async fetchLatestCommunityConfigs() {
        let response = await fetch(DefaultParserSiteSettings.serverJsonUrl);
        if (!response.ok) {
            throw new Error("Failed to fetch community configs from server");
        }
        let serverData = await response.json();
        let serverConfigs = serverData.configs || {};
        let serverTimestamp = serverData.last_updated || 0;

        // Only merge if server is newer
        if (serverTimestamp >= this.communityConfigsLastUpdated) {
            for (let hostname in serverConfigs) {
                this.communityConfigs[hostname] = serverConfigs[hostname];
            }
            this.communityConfigsLastUpdated = serverTimestamp;
        }
        return Object.keys(serverConfigs).length;
    }

    /** Submit current config to the remote server */
    async submitConfigToServer(hostname, contentCss, titleCss, removeCss) {
        let formData = new URLSearchParams();
        formData.append("hostname", hostname);
        formData.append("contentCss", contentCss);
        formData.append("titleCss", titleCss || "");
        formData.append("removeCss", removeCss || "");

        let response = await fetch(DefaultParserSiteSettings.serverPostUrl, {
            method: "POST",
            body: formData
        });
        if (!response.ok) {
            throw new Error("Failed to submit config to server");
        }
        return await response.json();
    }

    constructFindContentLogicForSite(hostname) {
        let logic = {
            findContent: dom => dom.querySelector("body"),
            findChapterTitle: () => null,
            removeUnwanted: () => null
        };
        let config = this.getConfigForSite(hostname);
        if (config != null) {
            logic.findContent = dom => dom.querySelector(config.contentCss);
            if (!util.isNullOrEmpty(config.titleCss))
            {
                logic.findChapterTitle = dom => dom.querySelector(config.titleCss);
            }
            if (!util.isNullOrEmpty(config.removeCss))
            {
                logic.removeUnwanted = (element) => {
                    for (let e of element.querySelectorAll(config.removeCss)) {
                        e.remove();
                    }
                };
            }
        }
        return logic;
    }
}
DefaultParserSiteSettings.storageName = "DefaultParserConfigs";
// TODO: Update this URL to the actual server URL once finalized
DefaultParserSiteSettings.serverJsonUrl = "http://webtoepub.devomin.de/defaultcss.json";
DefaultParserSiteSettings.serverPostUrl = "http://webtoepub.devomin.de/save_css.php";

/** Class that handles UI for configuring the Default Parser */
class DefaultParserUI { // eslint-disable-line no-unused-vars
    constructor() {
    }

    static async setupDefaultParserUI(hostname, parser) {
        // Load bundled community configs first
        await parser.siteConfigs.loadCommunityConfigs();
        
        let statusEl = document.getElementById("communityConfigStatus");
        statusEl.textContent = "";

        // If the user doesn't have their own config for this site, try to auto-fetch the latest community one
        let userConfig = parser.siteConfigs.configs.get(hostname);
        if (userConfig == null) {
            let localCommunityConfig = parser.siteConfigs.communityConfigs[hostname];
            try {
                statusEl.textContent = "Checking online for community config...";
                await parser.siteConfigs.fetchLatestCommunityConfigs();
                let onlineCommunityConfig = parser.siteConfigs.communityConfigs[hostname];
                
                if (onlineCommunityConfig != null) {
                    statusEl.textContent = "Found community config for this site!";
                } else {
                    throw new Error("Not found online.");
                }
            } catch (err) {
                // Online fetch failed or site not found online
                if (localCommunityConfig != null) {
                    // Restore local fallback if it existed
                    parser.siteConfigs.communityConfigs[hostname] = localCommunityConfig;
                    statusEl.textContent = "Using local offline community config.";
                } else {
                    statusEl.textContent = "Error: No community config found locally or online.";
                }
            }
        }

        DefaultParserUI.copyInstructions();
        DefaultParserUI.setDefaultParserUiVisibility(true);
        DefaultParserUI.populateDefaultParserUI(hostname, parser);
        document.getElementById("testDefaultParserButton").onclick = DefaultParserUI.testDefaultParser.bind(null, parser);
        document.getElementById("finisheddefaultParserButton").onclick = DefaultParserUI.onFinishedClicked.bind(null, parser);
        document.getElementById("submitConfigButton").onclick = DefaultParserUI.onSubmitConfig.bind(null, parser);
    }

    static onFinishedClicked(parser) {
        DefaultParserUI.AddConfiguration(parser);
        DefaultParserUI.setDefaultParserUiVisibility(false);
    }

    static AddConfiguration(parser) {
        let hostname = DefaultParserUI.getDefaultParserHostnameInput().value;
        let contentCss = DefaultParserUI.getContentCssInput().value;
        let titleCss = DefaultParserUI.getChapterTitleCssInput().value;
        let removeCss = DefaultParserUI.getUnwantedElementsCssInput().value.trim();
        let testUrl = DefaultParserUI.getTestChapterUrlInput().value.trim();

        parser.siteConfigs.saveSiteConfig(hostname, contentCss, titleCss, removeCss, testUrl);
    }

    static populateDefaultParserUI(hostname, parser) {
        DefaultParserUI.getDefaultParserHostnameInput().value = hostname;

        DefaultParserUI.getContentCssInput().value = "body";
        DefaultParserUI.getChapterTitleCssInput().value = "";
        DefaultParserUI.getUnwantedElementsCssInput().value = "";
        DefaultParserUI.getTestChapterUrlInput().value = "";

        let config = parser.siteConfigs.getConfigForSite(hostname);
        if (config != null) {
            DefaultParserUI.getContentCssInput().value = config.contentCss;
            DefaultParserUI.getChapterTitleCssInput().value = config.titleCss || "";
            DefaultParserUI.getUnwantedElementsCssInput().value = config.removeCss || "";
            DefaultParserUI.getTestChapterUrlInput().value = config.testUrl || "";
        }
    }



    /** Submit the current config to the community server */
    static async onSubmitConfig(parser) {
        let statusEl = document.getElementById("communityConfigStatus");
        let hostname = DefaultParserUI.getDefaultParserHostnameInput().value;
        let contentCss = DefaultParserUI.getContentCssInput().value;
        let titleCss = DefaultParserUI.getChapterTitleCssInput().value;
        let removeCss = DefaultParserUI.getUnwantedElementsCssInput().value.trim();

        if (util.isNullOrEmpty(hostname) || util.isNullOrEmpty(contentCss)) {
            statusEl.textContent = "Hostname and Content CSS are required to submit.";
            return;
        }

        try {
            statusEl.textContent = "Submitting config...";
            await parser.siteConfigs.submitConfigToServer(hostname, contentCss, titleCss, removeCss);
            statusEl.textContent = `Config for "${hostname}" submitted successfully! Thank you!`;
        } catch (err) {
            statusEl.textContent = "Error submitting: " + err.message;
        }
    }

    static setDefaultParserUiVisibility(isVisible) {
        // toggle mode
        ChapterUrlsUI.setVisibleUI(!isVisible);
        if (isVisible) {
            ChapterUrlsUI.getEditChaptersUrlsInput().hidden = true;
            ChapterUrlsUI.modifyApplyChangesButtons(button => button.hidden = true);
            document.getElementById("editURLsHint").hidden = true;
        }
        document.getElementById("defaultParserSection").hidden = !isVisible;
    }

    static async testDefaultParser(parser) {
        DefaultParserUI.AddConfiguration(parser);
        let hostname = DefaultParserUI.getDefaultParserHostnameInput().value;
        let config = parser.siteConfigs.getConfigForSite(hostname);
        if (util.isNullOrEmpty(config.testUrl))
        {
            alert(UIText.Warning.warningNoChapterUrl);
            return;
        }
        try {
            let xhr = await HttpClient.wrapFetch(config.testUrl);
            let webPage = { rawDom: util.sanitize(xhr.responseXML.querySelector("*")) };
            let content = parser.findContent(webPage.rawDom);
            if (content === null) {
                let errorMsg = UIText.Error.errorContentNotFound(config.testUrl);
                throw new Error(errorMsg);
            }
            parser.removeUnwantedElementsFromContentElement(content);
            parser.addTitleToContent(webPage, content);
            DefaultParserUI.showResult(content);
        } catch (err) {
            ErrorLog.showErrorMessage(err);
        }
    }

    static cleanResults() {
        let resultElement = DefaultParserUI.getResultViewElement();
        let children = resultElement.childNodes;
        while (0 < children.length) {
            children[children.length - 1].remove();
        }
    }

    static copyInstructions() {
        let content = document.getElementById("defaultParserInstructions");
        DefaultParserUI.showResult(content);
    }

    static showResult(content) {
        DefaultParserUI.cleanResults();
        if (content != null) {
            let resultElement = DefaultParserUI.getResultViewElement();
            util.moveChildElements(content, resultElement);
        }
    }

    static getDefaultParserHostnameInput() {
        return document.getElementById("defaultParserHostName");
    }

    static getContentCssInput() {
        return document.getElementById("defaultParserContentCss");
    }

    static getChapterTitleCssInput() {
        return document.getElementById("defaultParserChapterTitleCss");
    }

    static getUnwantedElementsCssInput() {
        return document.getElementById("defaultParserUnwantedElementsCss");
    }

    static getTestChapterUrlInput() {
        return document.getElementById("defaultParserTestChapterUrl");
    }

    static getResultViewElement() {
        return document.getElementById("defaultParserVewResult");
    }

    /** Called after a successful EPUB pack when using DefaultParser.
     *  Shows a one-time confirm dialog asking to share the config.
     *  Tracks prompted hostnames in localStorage so it doesn't repeat. */
    static async promptSubmitAfterPack(parser) {
        let hostname = DefaultParserUI.getDefaultParserHostnameInput().value;
        if (util.isNullOrEmpty(hostname)) {
            return;
        }

        // Check if we already prompted for this hostname
        let prompted = [];
        try {
            let raw = window.localStorage.getItem(DefaultParserUI.promptedStorageName);
            if (raw != null) {
                prompted = JSON.parse(raw);
            }
        } catch (e) {
            // ignore parse errors
        }
        if (prompted.includes(hostname)) {
            return;
        }

        // Mark as prompted regardless of their answer
        prompted.push(hostname);
        window.localStorage.setItem(DefaultParserUI.promptedStorageName, JSON.stringify(prompted));

        // Only prompt if user actually has a non-default config
        let config = parser.siteConfigs.getConfigForSite(hostname);
        if (config == null || config.contentCss === "body") {
            return;
        }

        let shouldSubmit = confirm(
            "Your EPUB was packed successfully!\n\n" +
            "Would you like to share your Default Parser CSS config for \"" + hostname + "\" " +
            "with the community so others can use it too?"
        );
        if (shouldSubmit) {
            try {
                await parser.siteConfigs.submitConfigToServer(
                    hostname, config.contentCss, config.titleCss || "", config.removeCss || ""
                );
                let statusEl = document.getElementById("communityConfigStatus");
                if (statusEl) {
                    statusEl.textContent = "Config for \"" + hostname + "\" submitted successfully! Thank you!";
                }
            } catch (err) {
                let statusEl = document.getElementById("communityConfigStatus");
                if (statusEl) {
                    statusEl.textContent = "Error submitting: " + err.message;
                }
            }
        }
    }
}
DefaultParserUI.promptedStorageName = "DefaultParserSubmitPrompted";
