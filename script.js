"use strict";

// 初始化 Mermaid
mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis'
    },
    sequence: {
        showSequenceNumbers: false,
        actorMargin: 50,
        messageMargin: 40
    },
    mindmap: {
        padding: 10,
        useMaxWidth: true
    }
});

function isRavenDisabled() {
    try {
        if (typeof disableRaven !== 'undefined' && disableRaven) return true;
        if (typeof window.disableRaven !== 'undefined' && window.disableRaven) return true;
        return false;
    } catch (ex) {
        return false;
    }
}

window.onerror = function (msg, url, line, column, err) {
    if (msg.indexOf("Permission denied") > -1) return;
    if (msg.indexOf("Object expected") > -1 && url.indexOf("epub") > -1) return;
    document.querySelector(".app .error").classList.remove("hidden");
    document.querySelector(".app .error .error-title").innerHTML = "Error";
    document.querySelector(".app .error .error-description").innerHTML = "Please try reloading the page or using a different browser (Chrome or Firefox), and if the error still persists, <a href=\"https://github.com/pgaskin/ePubViewer/issues\">report an issue</a>.";
    document.querySelector(".app .error .error-info").innerHTML = msg;
    document.querySelector(".app .error .error-dump").innerHTML = JSON.stringify({
        error: err.toString(),
        stack: err.stack,
        msg: msg,
        url: url,
        line: line,
        column: column,
    });
    try {
        if (!isRavenDisabled()) Raven.captureException(err);
    } catch (err) {}
};

let App = function (el) {
    this.ael = el;
    this.state = {};
    this.doReset();

    // 初始化拖动调节功能
    this.initResizeHandle();

    document.body.addEventListener("keyup", this.onKeyUp.bind(this));

    this.qsa(".tab-list .item").forEach(el => el.addEventListener("click", this.onTabClick.bind(this, el.dataset.tab)));
    this.qs(".sidebar .search-bar .search-box").addEventListener("keydown", event => {
        if (event.keyCode == 13) this.qs(".sidebar .search-bar .search-button").click();
    });
    this.qs(".sidebar .search-bar .search-button").addEventListener("click", this.onSearchClick.bind(this));
    this.qs(".sidebar-wrapper").addEventListener("click", event => {
        try {
            if (event.target.classList.contains("sidebar-wrapper")) event.target.classList.add("out");
        } catch (err) {
            this.fatal("error hiding sidebar", err);
        }
    });
    this.qsa(".chips[data-chips]").forEach(el => {
        Array.from(el.querySelectorAll(".chip[data-value]")).forEach(cel => cel.addEventListener("click", event => {
            this.setChipActive(el.dataset.chips, cel.dataset.value);
        }));
    });
    this.qs("button.prev").addEventListener("click", () => this.state.rendition.prev());
    this.qs("button.next").addEventListener("click", () => this.state.rendition.next());
    this.qs("button.open").addEventListener("click", () => this.doOpenBook());

    try {
        this.qs(".bar .loc").style.cursor = "pointer";
        this.qs(".bar .loc").addEventListener("click", event => {
            try {
                let answer = prompt(`Location to go to (up to ${this.state.book.locations.length()})?`, this.state.rendition.currentLocation().start.location);
                if (!answer) return;
                answer = answer.trim();
                if (answer == "") return;

                let parsed = parseInt(answer, 10);
                if (isNaN(parsed) || parsed < 0) throw new Error("Invalid location: not a positive integer");
                if (parsed > this.state.book.locations.length()) throw new Error("Invalid location");

                let cfi = this.state.book.locations.cfiFromLocation(parsed);
                if (cfi === -1) throw new Error("Invalid location");

                this.state.rendition.display(cfi);
            } catch (err) {
                alert(err.toString());
            }
        });
    } catch (err) {
        this.fatal("error attaching event handlers for location go to", err);
        throw err;
    }

    this.doTab("toc");

    try {
        this.loadSettingsFromStorage();
    } catch (err) {
        this.fatal("error loading settings", err);
        throw err;
    }
    this.applyTheme();
};

App.prototype.doBook = function (url, opts) {
    this.qs(".book").innerHTML = "Loading";

    opts = opts || {
        encoding: "epub"
    };
    console.log("doBook", url, opts);
    this.doReset();

    try {
        this.state.book = ePub(url, opts);
        this.qs(".book").innerHTML = "";
        this.state.rendition = this.state.book.renderTo(this.qs(".book"), {});
    } catch (err) {
        this.fatal("error loading book", err);
        throw err;
    }

    this.state.book.ready.then(this.onBookReady.bind(this)).catch(this.fatal.bind(this, "error loading book"));

    this.state.book.loaded.navigation.then(this.onNavigationLoaded.bind(this)).catch(this.fatal.bind(this, "error loading toc"));
    this.state.book.loaded.metadata.then(this.onBookMetadataLoaded.bind(this)).catch(this.fatal.bind(this, "error loading metadata"));
    this.state.book.loaded.cover.then(this.onBookCoverLoaded.bind(this)).catch(this.fatal.bind(this, "error loading cover"));

    this.state.rendition.hooks.content.register(this.applyTheme.bind(this));
    this.state.rendition.hooks.content.register(this.loadFonts.bind(this));

    this.state.rendition.on("relocated", this.onRenditionRelocated.bind(this));
    this.state.rendition.on("click", this.onRenditionClick.bind(this));
    this.state.rendition.on("keyup", this.onKeyUp.bind(this));
    this.state.rendition.on("displayed", this.onRenditionDisplayedTouchSwipe.bind(this));
    this.state.rendition.on("relocated", this.onRenditionRelocatedUpdateIndicators.bind(this));
    this.state.rendition.on("relocated", this.onRenditionRelocatedSavePos.bind(this));
    this.state.rendition.on("started", this.onRenditionStartedRestorePos.bind(this));
    this.state.rendition.on("displayError", this.fatal.bind(this, "error rendering book"));

    this.state.rendition.display();

    if (this.state.dictInterval) window.clearInterval(this.state.dictInterval);
    this.state.dictInterval = window.setInterval(this.checkDictionary.bind(this), 50);
    this.doDictionary(null);
};

App.prototype.loadSettingsFromStorage = function () {
    ["theme", "font", "font-size", "line-spacing", "margin", "progress"].forEach(container => this.restoreChipActive(container));
};

App.prototype.restoreChipActive = function (container) {
    let v = localStorage.getItem(`ePubViewer:${container}`);
    if (v) return this.setChipActive(container, v);
    this.setDefaultChipActive(container);
};

App.prototype.setDefaultChipActive = function (container) {
    let el = this.qs(`.chips[data-chips='${container}']`).querySelector(".chip[data-default]");
    this.setChipActive(container, el.dataset.value);
    return el.dataset.value;
};

App.prototype.setChipActive = function (container, value) {
    Array.from(this.qs(`.chips[data-chips='${container}']`).querySelectorAll(".chip[data-value]")).forEach(el => {
        el.classList[el.dataset.value == value ? "add" : "remove"]("active");
    });
    localStorage.setItem(`ePubViewer:${container}`, value);
    this.applyTheme();
    if (this.state.rendition && this.state.rendition.location) this.onRenditionRelocatedUpdateIndicators(this.state.rendition.location);
    return value;
};

App.prototype.getChipActive = function (container) {
    let el = this.qs(`.chips[data-chips='${container}']`).querySelector(".chip.active[data-value]");
    if (!el) return this.qs(`.chips[data-chips='${container}']`).querySelector(".chip[data-default]");
    return el.dataset.value;
};

App.prototype.doOpenBook = function () {
    var fi = document.createElement("input");
    fi.setAttribute("accept", "application/epub+zip");
    fi.style.display = "none";
    fi.type = "file";
    fi.onchange = event => {
        var reader = new FileReader();
        reader.addEventListener("load", () => {
            var arr = (new Uint8Array(reader.result)).subarray(0, 2);
            var header = "";
            for (var i = 0; i < arr.length; i++) {
                header += arr[i].toString(16);
            }
            if (header == "504b") {
                this.doBook(reader.result, {
                    encoding: "binary"
                });
            } else {
                this.fatal("invalid file", "not an epub book");
            }
        }, false);
        if (fi.files[0]) {
            reader.readAsArrayBuffer(fi.files[0]);
        }
    };
    document.body.appendChild(fi);
    fi.click();
};

App.prototype.fatal = function (msg, err, usersFault) {
    console.error(msg, err);
    document.querySelector(".app .error").classList.remove("hidden");
    document.querySelector(".app .error .error-title").innerHTML = "Error";
    document.querySelector(".app .error .error-description").innerHTML = usersFault ? "" : "Please try reloading the page or using a different browser, and if the error still persists, <a href=\"https://github.com/pgaskin/ePubViewer/issues\">report an issue</a>.";
    document.querySelector(".app .error .error-info").innerHTML = msg + ": " + err.toString();
    document.querySelector(".app .error .error-dump").innerHTML = JSON.stringify({
        error: err.toString(),
        stack: err.stack
    });
    try {
        if (!isRavenDisabled()) if (!usersFault) Raven.captureException(err);
    } catch (err) {}
};

App.prototype.doReset = function () {
    if (this.state.dictInterval) window.clearInterval(this.state.dictInterval);
    if (this.state.rendition) this.state.rendition.destroy();
    if (this.state.book) this.state.book.destroy();
    this.state = {
        book: null,
        rendition: null
    };
    this.qs(".sidebar-wrapper").classList.add("out");
    this.qs(".bar .book-title").innerHTML = "";
    this.qs(".bar .book-author").innerHTML = "";
    this.qs(".bar .loc").innerHTML = "";
    this.qs(".search-results").innerHTML = "";
    this.qs(".search-box").value = "";
    this.qs(".toc-list").innerHTML = "";
    this.qs(".info .cover").src = "";
    this.qs(".info .title").innerHTML = "";
    this.qs(".info .series-info").classList.remove("hidden");
    this.qs(".info .series-name").innerHTML = "";
    this.qs(".info .series-index").innerHTML = "";
    this.qs(".info .author").innerHTML = "";
    this.qs(".info .description").innerHTML = "";
    this.qs(".book").innerHTML = '<div class="empty-wrapper"><div class="empty"><div class="app-name">ePubViewer</div><div class="message"><a href="javascript:ePubViewer.doOpenBook();" class="big-button">Open a Book</a></div></div></div>';
    this.qs(".sidebar-button").classList.add("hidden");
    this.qs(".bar button.prev").classList.add("hidden");
    this.qs(".bar button.next").classList.add("hidden");
    this.qs(".summary-text").innerHTML = "";
    this.qs(".summary-placeholder").style.display = "block";
    this.doDictionary(null);
};

App.prototype.qs = function (q) {
    return this.ael.querySelector(q);
};

App.prototype.qsa = function (q) {
    return Array.from(this.ael.querySelectorAll(q));
};

App.prototype.el = function (t, c) {
    let e = document.createElement(t);
    if (c) e.classList.add(c);
    return e;
};

App.prototype.onBookReady = function (event) {
    this.qs(".sidebar-button").classList.remove("hidden");
    this.qs(".bar button.prev").classList.remove("hidden");
    this.qs(".bar button.next").classList.remove("hidden");

    console.log("bookKey", this.state.book.key());

    let chars = 1650;
    let key = `${this.state.book.key()}:locations-${chars}`;
    let stored = localStorage.getItem(key);
    console.log("storedLocations", typeof stored == "string" ? stored.substr(0, 40) + "..." : stored);

    if (stored) return this.state.book.locations.load(stored);
    console.log("generating locations");
    return this.state.book.locations.generate(chars).then(() => {
        localStorage.setItem(key, this.state.book.locations.save());
        console.log("locations generated", this.state.book.locations);
    }).catch(err => console.error("error generating locations", err));

    // 添加AI总结按钮事件监听
    this.qs('.ai-summary-button').addEventListener('click', () => this.doSummarize());
};

App.prototype.onTocItemClick = function (href, event) {
    console.log("tocClick", href);
    this.state.rendition.display(href).catch(err => console.warn("error displaying page", err));
    event.stopPropagation();
    event.preventDefault();
};

App.prototype.getNavItem = function(loc, ignoreHash) {
    return (function flatten(arr) {
        return [].concat(...arr.map(v => [v, ...flatten(v.subitems)]));
    })(this.state.book.navigation.toc).filter(
        item => ignoreHash ?
            this.state.book.canonical(item.href).split("#")[0] == this.state.book.canonical(loc.start.href).split("#")[0] :
            this.state.book.canonical(item.href) == this.state.book.canonical(loc.start.href)
    )[0] || null;
};

App.prototype.onNavigationLoaded = function (nav) {
    console.log("navigation", nav);
    let toc = this.qs(".toc-list");
    toc.innerHTML = "";
    let handleItems = (items, indent) => {
        items.forEach(item => {
            let a = toc.appendChild(this.el("a", "item"));
            a.href = item.href;
            a.dataset.href = item.href;
            a.innerHTML = `${"&nbsp;".repeat(indent*4)}${item.label.trim()}`;
            a.addEventListener("click", this.onTocItemClick.bind(this, item.href));
            handleItems(item.subitems, indent + 1);
        });
    };
    handleItems(nav.toc, 0);
};

App.prototype.onRenditionRelocated = function (event) {
    try {this.doDictionary(null);} catch (err) {}
    try {
        let navItem = this.getNavItem(event, false) || this.getNavItem(event, true);
        this.qsa(".toc-list .item").forEach(el => el.classList[(navItem && el.dataset.href == navItem.href) ? "add" : "remove"]("active"));
    } catch (err) {
        this.fatal("error updating toc", err);
    }
};

App.prototype.onBookMetadataLoaded = function (metadata) {
    console.log("metadata", metadata);
    this.qs(".bar .book-title").innerText = metadata.title.trim();
    this.qs(".bar .book-author").innerText = metadata.creator.trim();
    this.qs(".info .title").innerText = metadata.title.trim();
    this.qs(".info .author").innerText = metadata.creator.trim();
    if (!metadata.series || metadata.series.trim() == "") this.qs(".info .series-info").classList.add("hidden");
    this.qs(".info .series-name").innerText = metadata.series.trim();
    this.qs(".info .series-index").innerText = metadata.seriesIndex.trim();
    this.qs(".info .description").innerText = metadata.description;
    if (sanitizeHtml) this.qs(".info .description").innerHTML = sanitizeHtml(metadata.description);
};

App.prototype.onBookCoverLoaded = function (url) {
    if (!url)
        return;
    if (!this.state.book.archived) {
        this.qs(".cover").src = url;
        return;
    }
    this.state.book.archive.createUrl(url).then(url => {
        this.qs(".cover").src = url;
    }).catch(console.warn.bind(console));
};

App.prototype.onKeyUp = function (event) {
    let kc = event.keyCode || event.which;
    let b = null;
    if (kc == 37) {
        this.state.rendition.prev();
        b = this.qs(".app .bar button.prev");
    } else if (kc == 39) {
        this.state.rendition.next();
        b = this.qs(".app .bar button.next");
    }
    if (b) {
        b.style.transform = "scale(1.15)";
        window.setTimeout(() => b.style.transform = "", 150);
    }
};

App.prototype.onRenditionClick = function (event) {
    try {
        if (event.target.tagName.toLowerCase() == "a" && event.target.href) return;
        if (event.target.parentNode.tagName.toLowerCase() == "a" && event.target.parentNode.href) return;
        if (window.getSelection().toString().length !== 0) return;
        if (this.state.rendition.manager.getContents()[0].window.getSelection().toString().length !== 0) return;
    } catch (err) {}

    let wrapper = this.state.rendition.manager.container;
    let third = wrapper.clientWidth / 3;
    let x = event.pageX - wrapper.scrollLeft;
    let b = null;
    if (x > wrapper.clientWidth - 20) {
        event.preventDefault();
        this.doSidebar();
    } else if (x < third) {
        event.preventDefault();
        this.state.rendition.prev();
        b = this.qs(".bar button.prev");
    } else if (x > (third * 2)) {
        event.preventDefault();
        this.state.rendition.next();
        b = this.qs(".bar button.next");
    }
    if (b) {
        b.style.transform = "scale(1.15)";
        window.setTimeout(() => b.style.transform = "", 150);
    }
};

App.prototype.onRenditionDisplayedTouchSwipe = function (event) {
    let start = null
    let end = null;
    const el = event.document.documentElement;

    el.addEventListener('touchstart', event => {
        start = event.changedTouches[0];
    });
    el.addEventListener('touchend', event => {
        end = event.changedTouches[0];

        let hr = (end.screenX - start.screenX) / el.getBoundingClientRect().width;
        let vr = (end.screenY - start.screenY) / el.getBoundingClientRect().height;

        if (hr > vr && hr > 0.25) return this.state.rendition.prev();
        if (hr < vr && hr < -0.25) return this.state.rendition.next();
        if (vr > hr && vr > 0.25) return;
        if (vr < hr && vr < -0.25) return;
    });
};

App.prototype.applyTheme = function () {
    let theme = {
        bg: this.getChipActive("theme").split(";")[0],
        fg: this.getChipActive("theme").split(";")[1],
        l: "#1e83d2",
        ff: this.getChipActive("font"),
        fs: this.getChipActive("font-size"),
        lh: this.getChipActive("line-spacing"),
        ta: "justify",
        m: this.getChipActive("margin")
    };

    let rules = {
        "body": {
            "background": theme.bg,
            "color": theme.fg,
            "font-family": theme.ff != "" ? `${theme.ff} !important` : "!invalid-hack",
            "font-size": theme.fs != "" ? `${theme.fs} !important` : "!invalid-hack",
            "line-height": `${theme.lh} !important`,
            "text-align": `${theme.ta} !important`,
            "padding-top": theme.m,
            "padding-bottom": theme.m
        },
        "p": {
            "font-family": theme.ff != "" ? `${theme.ff} !important` : "!invalid-hack",
            "font-size": theme.fs != "" ? `${theme.fs} !important` : "!invalid-hack",
        },
        "a": {
            "color": "inherit !important",
            "text-decoration": "none !important",
            "-webkit-text-fill-color": "inherit !important"
        },
        "a:link": {
            "color": `${theme.l} !important`,
            "text-decoration": "none !important",
            "-webkit-text-fill-color": `${theme.l} !important`
        },
        "a:link:hover": {
            "background": "rgba(0, 0, 0, 0.1) !important"
        },
        "img": {
            "max-width": "100% !important"
        },
    };

    try {
        this.ael.style.background = theme.bg;
        this.ael.style.fontFamily = theme.ff;
        this.ael.style.color = theme.fg;
        if(this.state.rendition) this.state.rendition.getContents().forEach(c => c.addStylesheetRules(rules));
    } catch (err) {
        console.error("error applying theme", err);
    }
};

App.prototype.loadFonts = function() {
    this.state.rendition.getContents().forEach(c => {
        [
            "https://fonts.googleapis.com/css?family=Arbutus+Slab",
            "https://fonts.googleapis.com/css?family=Lato:400,400i,700,700i"
        ].forEach(url => {
            let el = c.document.body.appendChild(c.document.createElement("link"));
            el.setAttribute("rel", "stylesheet");
            el.setAttribute("href", url);
        });
    });
};

App.prototype.onRenditionRelocatedUpdateIndicators = function (event) {
    try {
        if (this.getChipActive("progress") == "bar") {
            // TODO: don't recreate every time the location changes.
            this.qs(".bar .loc").innerHTML = "";
            
            let bar = this.qs(".bar .loc").appendChild(document.createElement("div"));
            bar.style.position = "relative";
            bar.style.width = "60vw";
            bar.style.cursor = "default";
            bar.addEventListener("click", ev => ev.stopImmediatePropagation(), false);

            let range = bar.appendChild(document.createElement("input"));
            range.type = "range";
            range.style.width = "100%";
            range.min = 0;
            range.max = this.state.book.locations.length();
            range.value = event.start.location;
            range.addEventListener("change", () => this.state.rendition.display(this.state.book.locations.cfiFromLocation(range.value)), false);

            let markers = bar.appendChild(document.createElement("div"));
            markers.style.position = "absolute";
            markers.style.width = "100%";
            markers.style.height = "50%";
            markers.style.bottom = "0";
            markers.style.left = "0";
            markers.style.right = "0";

            for (let i = 0, last = -1; i < this.state.book.locations.length(); i++) {
                try {
                    let parsed = new ePub.CFI().parse(this.state.book.locations.cfiFromLocation(i));
                    if (parsed.spinePos < 0 || parsed.spinePos == last)
                        continue;
                    last = parsed.spinePos;

                    let marker = markers.appendChild(document.createElement("div"));
                    marker.style.position = "absolute";
                    marker.style.left = `${this.state.book.locations.percentageFromLocation(i) * 100}%`;
                    marker.style.width = "4px";
                    marker.style.height = "30%";
                    marker.style.cursor = "pointer";
                    marker.style.opacity = "0.5";
                    marker.addEventListener("click", this.onTocItemClick.bind(this, this.state.book.locations.cfiFromLocation(i)), false);

                    let tick = marker.appendChild(document.createElement("div"));
                    tick.style.width = "1px";
                    tick.style.height = "100%";
                    tick.style.backgroundColor = "currentColor";
                } catch (ex) {
                    console.warn("Error adding marker for location", i, ex);
                }
            }

            return;
        }

        let stxt = "Loading";
        if (this.getChipActive("progress") == "none") {
            stxt = "";
        } else if (this.getChipActive("progress") == "location" && event.start.location > 0) {
            stxt = `Loc ${event.start.location}/${this.state.book.locations.length()}`
        } else if (this.getChipActive("progress") == "chapter") {
            let navItem = this.getNavItem(event, false) || this.getNavItem(event, true);
            stxt = navItem ? navItem.label.trim() : (event.start.percentage > 0 && event.start.percentage < 1) ? `${Math.round(event.start.percentage * 100)}%` : "";
        } else {
            stxt = (event.start.percentage > 0 && event.start.percentage < 1) ? `${Math.round(event.start.percentage * 1000)/10}%` : "";
        }
        this.qs(".bar .loc").innerHTML = stxt;
    } catch (err) {
        console.error("error updating indicators");
    }
};

App.prototype.onRenditionRelocatedSavePos = function (event) {
    localStorage.setItem(`${this.state.book.key()}:pos`, event.start.cfi);
};

App.prototype.onRenditionStartedRestorePos = function (event) {
    try {
        let stored = localStorage.getItem(`${this.state.book.key()}:pos`);
        console.log("storedPos", stored);
        if (stored) this.state.rendition.display(stored);
    } catch (err) {
        this.fatal("error restoring position", err);
    }
};

App.prototype.checkDictionary = function () {
    try {
        let selection = (this.state.rendition.manager && this.state.rendition.manager.getContents().length > 0) ? this.state.rendition.manager.getContents()[0].window.getSelection().toString().trim() : "";
        if (selection.length < 2 || selection.indexOf(" ") > -1) {
            if (this.state.showDictTimeout) window.clearTimeout(this.state.showDictTimeout);
            this.doDictionary(null);
            return;
        }
        this.state.showDictTimeout = window.setTimeout(() => {
            try {
                let newSelection = this.state.rendition.manager.getContents()[0].window.getSelection().toString().trim();
                if (newSelection == selection) this.doDictionary(newSelection);
            } catch (err) {console.error(`showDictTimeout: ${err.toString()}`)}
        }, 300);
    } catch (err) {console.error(`checkDictionary: ${err.toString()}`)}
};

App.prototype.doDictionary = function (word) {
    if (this.state.lastWord) if (this.state.lastWord == word) return;
    this.state.lastWord = word;

    if (!this.qs(".dictionary-wrapper").classList.contains("hidden")) console.log("hide dictionary");
    this.qs(".dictionary-wrapper").classList.add("hidden");
    this.qs(".dictionary").innerHTML = "";
    if (!word) return;

    console.log(`define ${word}`);
    this.qs(".dictionary-wrapper").classList.remove("hidden");
    this.qs(".dictionary").innerHTML = "";

    let ldefinitionEl = this.qs(".dictionary").appendChild(document.createElement("div"));
    ldefinitionEl.classList.add("definition");

    let lwordEl = ldefinitionEl.appendChild(document.createElement("div"));
    lwordEl.classList.add("word");
    lwordEl.innerText = word;

    let lmeaningsEl = ldefinitionEl.appendChild(document.createElement("div"));
    lmeaningsEl.classList.add("meanings");
    lmeaningsEl.innerHTML = "Loading";

    fetch(`https://dict.api.pgaskin.net/word/${encodeURIComponent(word)}`).then(resp => {
        if (resp.status >= 500) throw new Error(`Dictionary not available`);
        if (resp.status == 404) throw new Error(`Word not found`);
        return resp.json();
    }).then(obj => {
        if (obj.status == "error") throw new Error(`ApiError: ${obj.result}`);
        return obj.result;
    }).then(obj => {
        console.log("dictLookup", obj);

        ldefinitionEl.parentElement.removeChild(ldefinitionEl);

        [obj].concat(obj.additional_words || []).concat(obj.referenced_words || []).map(word => {
            let definitionEl = this.qs(".dictionary").appendChild(document.createElement("div"));
            definitionEl.classList.add("definition");

            let wordEl = definitionEl.appendChild(document.createElement("div"));
            wordEl.classList.add("word");
            wordEl.innerText = [word.word].concat(word.alternates || []).join(", ").toLowerCase();

            let meaningsEl = definitionEl.appendChild(document.createElement("div"));
            meaningsEl.classList.add("meanings");

            if (word.info && word.info.trim() != "") {
                let infoEl = meaningsEl.appendChild(document.createElement("div"));
                infoEl.classList.add("info");
                infoEl.innerText = word.info;
            }

            (word.meanings || []).map((meaning, i) => {
                let meaningEl = meaningsEl.appendChild(document.createElement("div"));
                meaningEl.classList.add("meaning");

                let meaningTextEl = meaningEl.appendChild(document.createElement("div"));
                meaningTextEl.classList.add("text");
                meaningTextEl.innerText = `${i + 1}. ${meaning.text}`;

                if (meaning.example && meaning.example.trim() != "") {
                    let meaningExampleEl = meaningEl.appendChild(document.createElement("div"));
                    meaningExampleEl.classList.add("example");
                    meaningExampleEl.innerText = meaning.example;
                }
            });

            (word.notes || []).map(note => {
                let noteEl = meaningsEl.appendChild(document.createElement("div"));
                noteEl.classList.add("note");
                noteEl.innerText = note;
            });
        
            if (word.credit && word.credit.trim() != "") {
                let creditEl = meaningsEl.appendChild(document.createElement("div"));
                creditEl.classList.add("credit");
                creditEl.innerText = word.credit;
            }
        });
    }).catch(err => {
        try {
            console.error("dictLookup", err);
            lmeaningsEl.innerText = err.toString();
        } catch (err) {}
    });
};

App.prototype.doFullscreen = () => {
    document.fullscreenEnabled = document.fullscreenEnabled || document.mozFullScreenEnabled || document.documentElement.webkitRequestFullScreen;

    let requestFullscreen = element => {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.webkitRequestFullScreen) {
            element.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
        }
    };

    if (document.fullscreenEnabled) {
        requestFullscreen(document.documentElement);
    }
};

App.prototype.doSearch = function (q) {
    return Promise.all(this.state.book.spine.spineItems.map(item => {
        return item.load(this.state.book.load.bind(this.state.book)).then(doc => {
            let results = item.find(q);
            item.unload();
            return Promise.resolve(results);
        });
    })).then(results => Promise.resolve([].concat.apply([], results)));
};

App.prototype.onResultClick = function (href, event) {
    console.log("tocClick", href);
    this.state.rendition.display(href);
    event.stopPropagation();
    event.preventDefault();
};

App.prototype.doTab = function (tab) {
    try {
        this.qsa(".tab-list .item").forEach(el => el.classList[(el.dataset.tab == tab) ? "add" : "remove"]("active"));
        this.qsa(".tab-container .tab").forEach(el => el.classList[(el.dataset.tab != tab) ? "add" : "remove"]("hidden"));
        try {
            this.qs(".tab-container").scrollTop = 0;
        } catch (err) {}
    } catch (err) {
        this.fatal("error showing tab", err);
    }
};

App.prototype.onTabClick = function (tab, event) {
    console.log("tabClick", tab);
    this.doTab(tab);
    event.stopPropagation();
    event.preventDefault();
};

App.prototype.onSearchClick = function (event) {
    this.doSearch(this.qs(".sidebar .search-bar .search-box").value.trim()).then(results => {
        this.qs(".sidebar .search-results").innerHTML = "";
        let resultsEl = document.createDocumentFragment();
        results.slice(0, 200).forEach(result => {
            let resultEl = resultsEl.appendChild(this.el("a", "item"));
            resultEl.href = result.cfi;
            resultEl.addEventListener("click", this.onResultClick.bind(this, result.cfi));

            let textEl = resultEl.appendChild(this.el("div", "text"));
            textEl.innerText = result.excerpt.trim();

            resultEl.appendChild(this.el("div", "pbar")).appendChild(this.el("div", "pbar-inner")).style.width = (this.state.book.locations.percentageFromCfi(result.cfi)*100).toFixed(3) + "%";
        });
        this.qs(".app .sidebar .search-results").appendChild(resultsEl);
    }).catch(err => this.fatal("error searching book", err));
};

App.prototype.doSidebar = function () {
    this.qs(".sidebar-wrapper").classList.toggle('out');
};

App.prototype.doSummarize = async function() {
    const summaryContent = document.querySelector('.summary-text');
    const placeholder = document.querySelector('.summary-placeholder');
    const button = document.querySelector('.ai-summary-button');
    
    try {
        // 获取当前章节内容
        if (!this.state.rendition || !this.state.rendition.currentLocation()) {
            throw new Error("无法获取当前章节内容");
        }

        // 显示加载状态
        button.disabled = true;
        placeholder.style.display = 'none';
        summaryContent.innerHTML = '<div class="loading">正在生成AI总结...</div>';

        // 获取当前章节的完整内容
        const currentLocation = this.state.rendition.currentLocation();
        const currentSpineItem = this.state.book.spine.get(currentLocation.start.cfi);
        
        // 获取完整的章节内容
        let content = '';
        try {
            const doc = await currentSpineItem.load(this.state.book.load.bind(this.state.book));
            content = doc.documentElement.textContent;
        } catch (err) {
            console.error('Error loading chapter content:', err);
            // 如果无法获取完整内容，则使用当前可见部分
            content = await this.state.book.getRange(currentLocation.start.cfi);
        }
        
        // 获取章节标题
        const chapter = this.state.book.navigation.get(currentLocation.start.cfi);
        const chapterTitle = chapter ? chapter.label : null;

        // 调用API
        const response = await fetch('http://localhost:8001/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: content,
                chapter_title: chapterTitle
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '生成总结时出错');
        }

        const data = await response.json();
        
        // 配置 marked 选项
        marked.setOptions({
            gfm: true,
            breaks: true,
            headerIds: true,
            mangle: false,
            smartLists: true,
            highlight: async function(code, language) {
                if (language === 'mermaid') {
                    try {
                        // 为每个 mermaid 图表生成唯一的 ID
                        const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                        // 使用 mermaid API 渲染图形
                        const { svg } = await mermaid.render(id, code);
                        return svg;
                    } catch (err) {
                        console.error('Mermaid rendering error:', err);
                        return `<pre>${code}</pre>`;
                    }
                }
                return code;
            }
        });
        
        // 保存原始markdown内容用于复制功能
        summaryContent.setAttribute('data-markdown', data.summary);
        
        // 由于 marked 的 highlight 函数现在是异步的，我们需要等待渲染完成
        const renderMarkdown = async (markdown) => {
            // 找出所有的 mermaid 代码块
            const mermaidBlocks = [];
            const processedMarkdown = markdown.replace(/```mermaid([\s\S]*?)```/g, (match, code) => {
                const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                mermaidBlocks.push({ id, code: code.trim() });
                return `<div class="mermaid-placeholder" data-id="${id}"></div>`;
            });

            // 先渲染非 mermaid 的内容
            let renderedContent = marked.parse(processedMarkdown);

            // 渲染所有 mermaid 图表
            for (const block of mermaidBlocks) {
                try {
                    const { svg } = await mermaid.render(block.id, block.code);
                    renderedContent = renderedContent.replace(
                        `<div class="mermaid-placeholder" data-id="${block.id}"></div>`,
                        `<div class="mermaid-svg">${svg}</div>`
                    );
                } catch (err) {
                    console.error('Mermaid rendering error:', err);
                    renderedContent = renderedContent.replace(
                        `<div class="mermaid-placeholder" data-id="${block.id}"></div>`,
                        `<pre>${block.code}</pre>`
                    );
                }
            }

            return renderedContent;
        };

        // 渲染内容
        const renderedContent = await renderMarkdown(data.summary);
        
        // 清空之前的内容并显示新内容
        summaryContent.innerHTML = renderedContent;
        
        // 确保滚动到顶部
        summaryContent.scrollTop = 0;
        
        // 显示内容区域并隐藏占位符
        summaryContent.style.display = 'block';
        placeholder.style.display = 'none';
        
    } catch (error) {
        console.error('Summary error:', error);
        summaryContent.innerHTML = `<div class="error">错误：${error.message}</div>`;
    } finally {
        button.disabled = false;
    }
};

// 添加拖动调节功能
App.prototype.initResizeHandle = function() {
    const handle = document.getElementById('resize-handle');
    const readerContainer = document.querySelector('.reader-container');
    const summaryContainer = document.querySelector('.ai-summary-container');
    
    let isResizing = false;
    
    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.classList.add('resizing');
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const containerWidth = this.ael.offsetWidth;
        const newReaderWidth = e.clientX;
        const newSummaryWidth = containerWidth - newReaderWidth - handle.offsetWidth;
        
        // 确保两边都不小于最小宽度
        if (newReaderWidth >= 300 && newSummaryWidth >= 300) {
            readerContainer.style.width = newReaderWidth + 'px';
            summaryContainer.style.width = newSummaryWidth + 'px';
            
            // 触发阅读器重新渲染
            if (this.state.rendition) {
                this.state.rendition.resize();
            }
        }
    });
    
    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.classList.remove('resizing');
    });
};

let ePubViewer = null;

try {
    ePubViewer = new App(document.querySelector(".app"));
    let ufn = location.search.replace("?", "") || location.hash.replace("#", "");
    if (ufn.startsWith("!")) {
        ufn = ufn.replace("!", "");
        document.querySelector(".app button.open").style = "display: none !important";
    }
    if (ufn) {
        fetch(ufn).then(resp => {
            if (resp.status != 200) throw new Error("response status: " + resp.status.toString() + " " + resp.statusText);
        }).catch(err => {
            ePubViewer.fatal("error loading book", err, true);
        });
        ePubViewer.doBook(ufn);
    }
} catch (err) {
    document.querySelector(".app .error").classList.remove("hidden");
    document.querySelector(".app .error .error-title").innerHTML = "Error";
    document.querySelector(".app .error .error-description").innerHTML = "Please try reloading the page or using a different browser (Chrome or Firefox), and if the error still persists, <a href=\"https://github.com/pgaskin/ePubViewer/issues\">report an issue</a>.";
    document.querySelector(".app .error .error-dump").innerHTML = JSON.stringify({
        error: err.toString(),
        stack: err.stack
    });
    try {
        if (!isRavenDisabled) Raven.captureException(err);
    } catch (err) {}
}

// AI总结功能
async function summarizeChapter() {
    const summaryButton = document.querySelector('.ai-summary-button');
    const summaryText = document.querySelector('.summary-text');
    const placeholder = document.querySelector('.summary-placeholder');

    try {
        // 禁用按钮，显示加载状态
        summaryButton.disabled = true;
        summaryButton.innerHTML = '<i class="icon material-icons-outlined">hourglass_empty</i>正在生成总结...';
        
        // 获取当前章节内容
        const currentChapter = document.querySelector('.epub-container iframe').contentDocument.body.innerText;
        
        // 发送到后端
        const response = await fetch('http://localhost:8001/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: currentChapter })
        });

        if (!response.ok) {
            throw new Error('获取总结失败');
        }

        const data = await response.json();
        
        // 配置 marked 选项
        marked.setOptions({
            gfm: true,
            breaks: true,
            headerIds: true,
            mangle: false,
            smartLists: true,
            highlight: async function(code, language) {
                if (language === 'mermaid') {
                    try {
                        // 为每个 mermaid 图表生成唯一的 ID
                        const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                        // 使用 mermaid API 渲染图形
                        const { svg } = await mermaid.render(id, code);
                        return svg;
                    } catch (err) {
                        console.error('Mermaid rendering error:', err);
                        return `<pre>${code}</pre>`;
                    }
                }
                return code;
            }
        });
        
        // 保存原始markdown内容用于复制功能
        summaryText.setAttribute('data-markdown', data.summary);
        
        // 由于 marked 的 highlight 函数现在是异步的，我们需要等待渲染完成
        const renderMarkdown = async (markdown) => {
            // 找出所有的 mermaid 代码块
            const mermaidBlocks = [];
            const processedMarkdown = markdown.replace(/```mermaid([\s\S]*?)```/g, (match, code) => {
                const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                mermaidBlocks.push({ id, code: code.trim() });
                return `<div class="mermaid-placeholder" data-id="${id}"></div>`;
            });

            // 先渲染非 mermaid 的内容
            let renderedContent = marked.parse(processedMarkdown);

            // 渲染所有 mermaid 图表
            for (const block of mermaidBlocks) {
                try {
                    const { svg } = await mermaid.render(block.id, block.code);
                    renderedContent = renderedContent.replace(
                        `<div class="mermaid-placeholder" data-id="${block.id}"></div>`,
                        `<div class="mermaid-svg">${svg}</div>`
                    );
                } catch (err) {
                    console.error('Mermaid rendering error:', err);
                    renderedContent = renderedContent.replace(
                        `<div class="mermaid-placeholder" data-id="${block.id}"></div>`,
                        `<pre>${block.code}</pre>`
                    );
                }
            }

            return renderedContent;
        };

        // 渲染内容
        const renderedContent = await renderMarkdown(data.summary);
        
        // 清空之前的内容并显示新内容
        summaryText.innerHTML = renderedContent;
        
        // 确保滚动到顶部
        summaryText.scrollTop = 0;
        
        // 显示内容区域并隐藏占位符
        summaryText.style.display = 'block';
        placeholder.style.display = 'none';
    } catch (error) {
        console.error('Error:', error);
        summaryText.innerHTML = '生成总结时出错，请稍后重试。';
    } finally {
        // 恢复按钮状态
        summaryButton.disabled = false;
        summaryButton.innerHTML = '<i class="icon material-icons-outlined">psychology</i>AI章节总结';
    }
}

// 添加按钮点击事件监听
document.addEventListener('DOMContentLoaded', function() {
    const summaryButton = document.querySelector('.ai-summary-button');
    if (summaryButton) {
        summaryButton.addEventListener('click', summarizeChapter);
    }
    
    // 添加复制按钮点击事件监听
    const copyButton = document.querySelector('.copy-summary-button');
    if (copyButton) {
        copyButton.addEventListener('click', copySummaryContent);
    }
});

// 复制AI总结内容的函数
function copySummaryContent() {
    const summaryText = document.querySelector('.summary-text');
    const placeholder = document.querySelector('.summary-placeholder');
    const copyButton = document.querySelector('.copy-summary-button');
    
    // 检查是否有内容可复制
    if (placeholder.style.display !== 'none' || !summaryText.innerHTML.trim()) {
        // 如果没有内容，禁用按钮并提示
        copyButton.disabled = true;
        setTimeout(() => {
            copyButton.disabled = false;
        }, 2000);
        return;
    }
    
    try {
        // 获取原始的markdown内容
        const markdownContent = summaryText.getAttribute('data-markdown') || summaryText.textContent;
        
        // 复制到剪贴板
        navigator.clipboard.writeText(markdownContent).then(() => {
            // 复制成功，显示临时提示
            const originalIcon = copyButton.innerHTML;
            copyButton.innerHTML = '<i class="icon material-icons-outlined">check</i>';
            copyButton.style.background = '#4CAF50';
            
            // 2秒后恢复原样
            setTimeout(() => {
                copyButton.innerHTML = originalIcon;
                copyButton.style.background = '';
            }, 2000);
        });
    } catch (err) {
        console.error('复制失败:', err);
    }
}

// 修改显示 AI 总结的函数
App.prototype.displayAISummary = function(summary) {
    const summaryText = this.qs(".summary-text");
    const placeholder = this.qs(".summary-placeholder");
    
    if (summary) {
        // 保存原始markdown内容
        summaryText.setAttribute('data-markdown', summary);
        
        // 使用异步函数渲染Markdown和Mermaid图表
        (async () => {
            // 找出所有的 mermaid 代码块
            const mermaidBlocks = [];
            const processedMarkdown = summary.replace(/```mermaid([\s\S]*?)```/g, (match, code) => {
                const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                mermaidBlocks.push({ id, code: code.trim() });
                return `<div class="mermaid-placeholder" data-id="${id}"></div>`;
            });

            // 先渲染非 mermaid 的内容
            let renderedContent = marked.parse(processedMarkdown);

            // 渲染所有 mermaid 图表
            for (const block of mermaidBlocks) {
                try {
                    const { svg } = await mermaid.render(block.id, block.code);
                    renderedContent = renderedContent.replace(
                        `<div class="mermaid-placeholder" data-id="${block.id}"></div>`,
                        `<div class="mermaid-svg">${svg}</div>`
                    );
                } catch (err) {
                    console.error('Mermaid rendering error:', err);
                    renderedContent = renderedContent.replace(
                        `<div class="mermaid-placeholder" data-id="${block.id}"></div>`,
                        `<pre>${block.code}</pre>`
                    );
                }
            }

            // 更新内容
            summaryText.innerHTML = renderedContent;
        })();
        
        placeholder.style.display = "none";
    } else {
        summaryText.innerHTML = "";
        summaryText.removeAttribute('data-markdown');
        placeholder.style.display = "block";
    }
};