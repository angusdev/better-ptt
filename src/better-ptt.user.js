/*jshint devel: true, browser: true */
/*global chrome, console, $ */
(function() {
'use strict';

const KEYCODE_ENTER = 13;
const KEYCODE_SHIFT = 16;
const KEYCODE_ESC = 27;
const KEYCODE_SPACE = 32;
const KEYCODE_PAGE_UP = 33;
const KEYCODE_PAGE_DOWN = 34;
const KEYCODE_END = 35;
const KEYCODE_HOME = 36;
const KEYCODE_LEFT = 37;
const KEYCODE_UP = 38;
const KEYCODE_RIGHT = 39;
const KEYCODE_DOWN = 40;
const KEYCODE_SLASH = 191;

const SCROLL_NONE = 0;
const SCROLL_UP = 1;
const SCROLL_DOWN = 2;

const PAGE_TYPE_NONE = 0;
const PAGE_TYPE_BOARD = 1;
const PAGE_TYPE_MESSAGE = 2;

let boardOffsetTop = 0;

let prevScrollY = window.scrollY;

let pageType = PAGE_TYPE_NONE;
let boardIndex = 0;

let xhr = null;

const requestAnimationFrame =
  function(/* function */ callback){
    window.setTimeout(callback, 1000 / 60);
  };

function compareVersion(v1, v2) {
  const t1 = (v1 || '').split('.');
  const t2 = (v2 || '').split('.');
  for (let i=0;i<Math.min(t1.length, t2.length);i++) {
    let n1 = parseInt(t1[i], 10);
    let n2 = parseInt(t2[i], 10);
    n1 = isNaN(n1)?0:n1;
    n2 = isNaN(n2)?0:n2;
    if (n1 !== n2) {
      return n1 < n2 ? -1 : 1;
    }
  }
  return (t1.length < t2.length)?-1:(t1.length > t2.length?1:0);
}

function offsetTop(ele) {
  let top = 0;
  while (ele) {
    if (!isNaN(ele.offsetTop)) {
      top += ele.offsetTop;
    }
    ele = ele.offsetParent;
  }

  return top;
}

function getViewport() {
  const top = window.scrollY;
  return  { top:top, bottom:top + Math.max(document.documentElement.clientHeight, window.innerHeight || 0) };
}

function inViewport(ele) {
  const vp = getViewport();
  const eleTop = offsetTop(ele);
  const eleBottom = eleTop + ele.offsetHeight;

  return ((eleBottom <= vp.bottom) && (eleTop >= vp.top + boardOffsetTop));
}

function animateScrollTo(scrollTo, interval, onComplete) {
  const start = new Date().getTime();
  const startY = window.scrollY;
  const isUp = scrollTo < startY;

  function scroller() {
    const now = new Date().getTime();
    if (now - start >= interval) {
      window.scrollTo(0, scrollTo);
      if (onComplete) {
        onComplete.apply();
      }
    }
    else {
      window.scrollTo(0,
                      isUp?(Math.max(scrollTo, startY + (scrollTo - startY) * (now - start) / interval)):
                           (Math.min(scrollTo, startY + (scrollTo - startY) * (now - start) / interval)));
      requestAnimationFrame(scroller);
    }
  }
  requestAnimationFrame(scroller);
}

function animate(element, toOpts, interval, onComplete) {
  function initState() {
    const result = {};
    const computedStyle = window.getComputedStyle(element) ?? [];
    for (let key in toOpts) {
      result[key] = computedStyle[key] || ('0' + (toOpts[key] + '').replace(/(.*\d+)/, ''));
      if (result[key].match(/\d$/)) {
        result[key] += 'px';
      }
    }

    return result;
  }

  const initOpts = initState();

  const start = new Date().getTime();

  function animator() {
    const now = new Date().getTime();

    if (!window.getComputedStyle || now - start >= interval) {
      for (let doneKey in toOpts) {
        const doneTo = parseFloat(toOpts[doneKey]);
        let doneUnit = (initOpts[doneKey] + '').match(/([^\d]*)$/);
        doneUnit = doneUnit?doneUnit[1].trim():'';
        element.style[doneKey] = doneTo + doneUnit;
      }
      if (onComplete) {
        onComplete.apply(element);
      }
    }
    else {
      for (let key in toOpts) {
        let from = initOpts[key];
        let to = toOpts[key];
        let unit = (from + '').match(/([^\d]*)$/);
        unit = unit?unit[1].trim():'';
        from = parseFloat(from);
        to = parseFloat(to);
        const target = (from + (to - from) * (now - start) / interval) + unit;
        element.style[key] = target;
      }
      requestAnimationFrame(animator);
    }
  }
  requestAnimationFrame(animator);
}

function ensureVisible(ele, top, padding) {
  if (typeof padding !== 'number') {
    padding = 20;
  }
  padding = parseInt(padding, 10);

  if (!inViewport(ele)) {
    let y = -1;
    if (top === true) {
      y = Math.max(offsetTop(ele) - padding - boardOffsetTop, 0);
    }
    else if (top === false) {
      const vp = getViewport();
      y = offsetTop(ele) + ele.offsetHeight + padding - (vp.bottom - vp.top);
    }
    if (y >= 0) {
      ele.setAttribute('data-ensure-visible', 'true');
      animateScrollTo(y, 200, function() { ele.removeAttribute('data-ensure-visible'); });
    }
  }
}

function getLinks() {
  return document.querySelectorAll('#main-container > div.r-list-container.bbs-screen div.title > a');
}

function getLinkByHref(href) {
  return document.querySelector('#main-container > div.r-list-container.bbs-screen div.title > a[href="' + href + '"]');
}

function getSelectedLink() {
  return document.querySelector('.ellab-selected');
}

function isSelected(ele) {
  return (ele && /\s*ellab\-selected\s*/.test(ele.className));
}

function select(ele) {
  if (ele) {
    ele.className = (ele.className + ' ellab-selected').replace(/^\s+/, '');

    document.cookie = 'ellabselectedarticle=' + ele.getAttribute('href') + ';';

    // load the preview
    if (xhr) {
      xhr.abort();
      xhr = new XMLHttpRequest();
    }
    else {
      xhr = new XMLHttpRequest();
    }
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          const t = xhr.responseText;
          const parser = new DOMParser();
          const doc = parser.parseFromString(t, "text/html");
          // remove unwanted elements
          const eleArray = doc.querySelectorAll('.article-metaline, .article-metaline-right, .f2');
          for (let i=0 ; i<eleArray.length ; i++) {
            eleArray[i].parentNode.removeChild(eleArray[i]);
          }
          const content = doc.getElementById('main-content');
          if (content) {
            content.setAttribute('id', 'preview-' + content.getAttribute('id'));
            document.getElementById('preview').innerHTML = '';
            document.getElementById('preview').appendChild(content.cloneNode(true));
          }
        }
        xhr = null;
      }
    };

    xhr.open('GET', ele.href, true);
    xhr.send();
  }
}

function unselect() {
  const link = getSelectedLink();
  if (link) {
    link.className = link.className.replace(/\s*ellab\-selected\s*/, '');
    if (!link.className) {
      link.removeAttribute('class');
    }
  }
}

function getNextLink(isUp) {
  const links = getLinks();
  if (links.length === 0) {
    return null;
  }

  const curr = getSelectedLink();
  if (curr === null) {
    return links[0];
  }

  let prev = null;
  for (let i=0 ; i<links.length ; i++) {
    if (isSelected(links[i])) {
      if (isUp) {
        return prev || links[i];
      }
      else {
        return i<links.length-1?links[i+1]:links[i];
      }
    }

    prev = links[i];
  }
}

function boardKeyDown(e) {
  if (e.altKey || e.altGraphKey || e.ctrlKey || e.metaKey || e.keyCode === KEYCODE_SHIFT) {
    return;
  }

  const help = document.querySelector('.kbhelp');
  if (help.style.display === '') {
    help.style.display = 'none';
    return;
  }
  if (e.keyCode === KEYCODE_SLASH) {
    help.style.display = '';
    return;
  }

  const preview = document.getElementById('preview');
  const expandedPreview = preview.getAttribute('data-ellab-preview-expanded');

  if (e.keyCode === KEYCODE_ENTER) {
    e.preventDefault();
    e.stopPropagation();

    const curr = getSelectedLink();
    if (curr) {
      curr.click();
    }
  }
  else if (((expandedPreview || e.shiftKey) &&
            (e.keyCode === KEYCODE_UP || e.keyCode === KEYCODE_DOWN ||
             e.keyCode === KEYCODE_PAGE_UP || e.keyCode === KEYCODE_PAGE_DOWN ||
             e.keyCode === KEYCODE_HOME || e.keyCode === KEYCODE_END)) ||
           (expandedPreview && !e.shiftKey && e.keyCode === KEYCODE_SPACE)) {
    // preview is expanded then up, down, or shift-up, shift-down, scroll the preview
    // preview is expanded then space, page down the preview

    e.preventDefault();
    e.stopPropagation();

    const isPageDown = e.keyCode === KEYCODE_PAGE_DOWN ||
                       (expandedPreview && e.shiftKey && e.keyCode === KEYCODE_DOWN) ||
                       (expandedPreview && !e.shiftKey && e.keyCode === KEYCODE_SPACE);
    const isPageUp =  e.keyCode === KEYCODE_PAGE_UP ||
                      (expandedPreview && e.shiftKey && e.keyCode === KEYCODE_UP);

    if (!preview.getAttribute('ellab-original-offset-top')) {
      preview.setAttribute('ellab-original-offset-top', preview.offsetTop);
    }

    // scroll 20% of page normally, large scroll (80%) for page up/down
    const scrollPageSize = (isPageUp || isPageDown)?0.8:0.2;
    const originalOffsetTop = parseInt(preview.getAttribute('ellab-original-offset-top'), 10);
    const vp = getViewport();
    const previewHeight = vp.bottom - vp.top - originalOffsetTop;
    const scrollHeight = previewHeight - Math.max(20, previewHeight * (1 - scrollPageSize));

    let tm = preview.style.marginTop || 0;
    tm = parseInt(tm, 10);
    if (e.keyCode === KEYCODE_HOME) {
      tm = 0;
    }
    else if (e.keyCode === KEYCODE_END) {
      tm = -preview.offsetHeight + previewHeight;
    }
    else if (e.keyCode === KEYCODE_UP || isPageUp) {
      tm = Math.min(0, tm + scrollHeight);
    }
    else if (e.keyCode === KEYCODE_DOWN || isPageDown) {
      tm = Math.max(-preview.offsetHeight + previewHeight, tm - scrollHeight);
    }
    // marginTop won't > 0
    tm = Math.min(0, tm);
    animate(preview, { marginTop: tm }, 200);
  }
  else if ((expandedPreview && e.keyCode === KEYCODE_ESC) || (!e.shiftKey && e.keyCode === KEYCODE_LEFT)) {
    // expanded preview, then press esc, or left, collapse preview
    e.preventDefault();
    e.stopPropagation();

    preview.removeAttribute('data-ellab-preview-expanded');
    preview.style.marginTop = 0;

    animate(preview, { width: 400 }, 200);
    document.querySelector('.r-list-container.bbs-screen').className =
      document.querySelector('.r-list-container.bbs-screen').className.replace(/\s+back/, '');
  }
  else if ((!expandedPreview && e.keyCode === KEYCODE_SPACE) || (!e.shiftKey && e.keyCode === KEYCODE_RIGHT)) {
    // collapsed preview, then press space, or right, expand preview

    e.preventDefault();
    e.stopPropagation();

    preview.setAttribute('data-ellab-preview-expanded', true);
    preview.style.marginTop = 0;

    const oldWidth = preview.style.width;
    preview.style.width = '100%';
    const widthPx = parseInt(window.getComputedStyle(preview).width, 10);
    preview.style.width = oldWidth;

    animate(preview, { width: widthPx * 0.8 }, 200);
    document.querySelector('.r-list-container.bbs-screen').className =
      document.querySelector('.r-list-container.bbs-screen').className.replace(/\s+back/, '') + ' back';
  }
  else if (e.keyCode === KEYCODE_UP || e.keyCode === KEYCODE_DOWN) {
    // up, down, scroll the links
    e.preventDefault();
    e.stopPropagation();

    const link = getNextLink(e.keyCode === KEYCODE_UP);
    unselect();
    select(link);
    ensureVisible(link, e.keyCode === KEYCODE_UP);
  }
  else if (e.keyCode === KEYCODE_END) {
    // end key
    e.preventDefault();
    e.stopPropagation();

    const endlinks = getLinks();
    if (endlinks.length) {
      unselect();
      select(endlinks[endlinks.length - 1]);
      ensureVisible(endlinks[endlinks.length - 1], false);
    }
  }
  else if (e.keyCode === KEYCODE_HOME) {
    // home key
    e.preventDefault();
    e.stopPropagation();

    const homeLinks = getLinks();
    if (homeLinks.length) {
      unselect();
      select(homeLinks[0]);
      ensureVisible(homeLinks[0], true);
    }
  }
  else if (e.shiftKey && e.keyCode === KEYCODE_RIGHT) {
    // shift-right key, next page
    e.preventDefault();
    e.stopPropagation();

    if (boardIndex) {
      const nextLink = document.querySelector('a[href*="index' + (boardIndex + 1) + '.html"]');
      if (nextLink) {
        nextLink.click();
      }
    }
  }
  else if (e.shiftKey && e.keyCode === KEYCODE_LEFT) {
    // shift-left key, prev page
    e.preventDefault();
    e.stopPropagation();

    let prevLink = null;
    if (boardIndex) {
      prevLink = document.querySelector('a[href*="index' + (boardIndex - 1) + '.html"]');
    }
    else {
      prevLink = document.querySelector('.action-bar > .btn-group-paging a:nth-child(2)');
    }
    if (prevLink) {
      prevLink.click();
    }
  }
}

function boardScroll(e) {
  const curr = getSelectedLink();
  if (curr && (curr.getAttribute('data-ensure-visible') || inViewport(curr))) {
    return;
  }

  unselect();

  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
    // you're at the bottom of the page
  }

  const links = getLinks();
  if (e.scrollDirection === SCROLL_DOWN) {
    for (let i=0 ; i<links.length ; i++) {
      if (inViewport(links[i])) {
          select(links[i]);
          break;
      }
    }
  }
  else if (e.scrollDirection === SCROLL_UP) {
    for (let i=links.length-1 ; i>=0 ; i--) {
      if (inViewport(links[i])) {
          select(links[i]);
          break;
      }
    }
  }
}

function messageKeyDown(e) {
  if (e.altKey || e.altGraphKey || e.ctrlKey || e.metaKey || e.shiftKey) {
    return;
  }

  const curr = document.querySelector('.ellab-selected');

  if (e.keyCode === KEYCODE_LEFT) {
    e.preventDefault();
    e.stopPropagation();

    history.go(-1);
  }
}

function constructKeyboardHelp() {
  const kbhelps = [
    ['?', '顯示此幫助畫面 (按任意鍵關閉)'],
    [' '],
    ['up, down', '上一則 / 下一則'],
    ['shift+left, shift+right', '上一頁 / 下一頁看板'],
    ['shift+up, shift+down', '預覽面板上 / 下捲動'],
    ['shift+pgup, shift+pgdn', '預覽面板上 / 下捲動一頁'],
    ['shift+home, shift+end', '預覽面板跳至最頂或最底'],
    ['展開 / 還原預覽面板：'],
    ['right, space', '展開預覽面板'],
    ['left, esc', '還原預覽面板'],
    ['當預覽面板展開時：'],
    ['up, down', '預覽面板上 / 下捲動'],
    ['pgup, shift+up', '預覽面板向上捲動一頁'],
    ['pgdn, shift+down, space', '預覽面板向下捲動一頁'],
    ['home, end', '預覽面板跳至最頂或最底'],
  ];
  const help = document.createElement('div');
  help.className = 'kbhelp';
  help.style.display = 'none';
  let helphtml = '';
  for (let i=0 ; i<kbhelps.length ; i++) {
    if (kbhelps[i].length === 1) {
      helphtml += '<div class="kbhelp-section">' + kbhelps[i][0] + '</div>';
    }
    else {
      let keyhtml = '<div class="kbhelp-key"><span>' + kbhelps[i][0] + '</span></div>';
      // escape the "," first
      keyhtml = keyhtml.replace(/\\,/g, '&#44');
      keyhtml = keyhtml.replace(/,\s*/g, '</span></div><div class="kbhelp-separator">或</div><div class="kbhelp-key"><span>');
      keyhtml = keyhtml.replace(/\+/g, '</span></div><div class="kbhelp-key"><span>');
      keyhtml = keyhtml.replace(/>(up|down|left|right)</g, '>&nbsp;<div class="arrow-$1"></div><');

      helphtml += '<div class="kbhelp-item"><div class="kbhelp-shortcut">' + keyhtml + '</div><div class="kbhelp-desc">' + kbhelps[i][1] + '</div></div>';
    }
  }
  help.innerHTML = helphtml;
  document.body.appendChild(help);
}

function main() {
  // Main function here
  let res = document.location.href.match(/https?:\/\/(www\.)?ptt\.cc\/bbs\/.+\/index(\d*)\.html/);
  if (res) {
    boardIndex = parseInt(res[2], 10);
  }
  else {
    res = document.location.href.match(/https?:\/\/(www\.)?ptt\.cc\/bbs\/.+\/search\?(page=(\d+)&)?q=.*/);
    if (res) {
      boardIndex = parseInt(res[3], 10);
    }
  }
  if (res) {
    pageType = PAGE_TYPE_BOARD;
    boardOffsetTop = offsetTop(document.getElementById('main-container'));
    const div = document.createElement('div');
    div.setAttribute('id', 'preview');
    document.body.appendChild(div);

    let prevSelectedLink = null;
    const lastSelectedArticle = document.cookie.match(/ellabselectedarticle\=([^;]+)/);
    if (lastSelectedArticle) {
      prevSelectedLink = getLinkByHref(lastSelectedArticle[1]);
    }
    if (prevSelectedLink) {
      select(prevSelectedLink);
    }
    else {
      boardScroll({ scrollDirection: SCROLL_DOWN });
    }

    constructKeyboardHelp();
  }
  else if (/https?:\/\/(www\.)?ptt\.cc\/bbs\/.+\/.+\.html/.test(document.location.href)) {
    pageType = PAGE_TYPE_MESSAGE;
  }

  document.addEventListener('keydown', function(e) {
    if (pageType === PAGE_TYPE_BOARD) {
      boardKeyDown(e);
    }
    else if (pageType === PAGE_TYPE_MESSAGE) {
      messageKeyDown(e);
    }
  }, false);

  window.addEventListener('scroll', function(e) {
    e.scrollDirection = window.scrollY > prevScrollY?SCROLL_DOWN:(window.scrollY < prevScrollY?SCROLL_UP:SCROLL_NONE);
    prevScrollY = window.scrollY;
    if (pageType === PAGE_TYPE_BOARD) {
      boardScroll(e);
    }
  }, false);
}

main();

// show the help if upgrade a new version
chrome.storage.local.get('lastVersion', function(v) {
  const lastVersion = v.lastVersion;
  const currVersion = chrome.runtime.getManifest().version;
  if (compareVersion(lastVersion, currVersion) < 0) {
    document.querySelector('.kbhelp').style.display = '';
    chrome.storage.local.set({lastVersion: currVersion});
  }
});

})();
