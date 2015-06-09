/*jshint devel: true, browser: true */
/*global chrome, console, $ */
(function() {
'use strict';

var boardOffsetTop = 0;

var prevScrollY = window.scrollY;
var SCROLL_NONE = 0;
var SCROLL_UP = 1;
var SCROLL_DOWN = 2;

var PAGE_TYPE_NONE = 0;
var PAGE_TYPE_BOARD = 1;
var PAGE_TYPE_MESSAGE = 2;

var pageType = PAGE_TYPE_NONE;
var boardIndex = 0;

var xhr = null;

var requestAnimationFrame =
  (
    requestAnimationFrame ||
    (
      function(/* function */ callback){
        window.setTimeout(callback, 1000 / 60);
      }
    )
  );

function offsetTop(ele) {
  var top = 0;
  while (ele) {
    if (!isNaN(ele.offsetTop)) top += ele.offsetTop;
    ele = ele.offsetParent;
  }

  return top;
}

function getViewport() {
  var top = window.scrollY;
  return  { top:top, bottom:top + Math.max(document.documentElement.clientHeight, window.innerHeight || 0) };
}

function inViewport(ele) {
  var vp = getViewport();
  var eleTop = offsetTop(ele);
  var eleBottom = eleTop + ele.offsetHeight;

  return ((eleBottom <= vp.bottom) && (eleTop >= vp.top + boardOffsetTop));
}

function animateScrollTo(scrollTo, interval, onComplete) {
  var start = new Date().getTime();
  var startY = window.scrollY;
  var isUp = scrollTo < startY;

  function scroller() {
    var now = new Date().getTime();
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
    var result = {};
    var computedStyle = [];
    if (window.getComputedStyle) {
      computedStyle = window.getComputedStyle(element);
    }
    for (var key in toOpts) {
      result[key] = computedStyle[key] || ('0' + (toOpts[key] + '').replace(/(.*\d+)/, ''));
      if (result[key].match(/\d$/)) {
        result[key] += 'px';
      }
    }

    return result;
  }

  var initOpts = initState();

  var start = new Date().getTime();

  function animator() {
    var now = new Date().getTime();

    if (!window.getComputedStyle || now - start >= interval) {
      for (var doneKey in toOpts) {
        var doneTo = parseFloat(toOpts[doneKey]);
        var doneUnit = (initOpts[doneKey] + '').match(/([^\d]*)$/);
        doneUnit = doneUnit?doneUnit[1].trim():'';
        element.style[doneKey] = doneTo + doneUnit;
      }
      if (onComplete) {
        onComplete.apply(element);
      }
    }
    else {
      for (var key in toOpts) {
        var from = initOpts[key];
        var to = toOpts[key];
        var unit = (from + '').match(/([^\d]*)$/);
        unit = unit?unit[1].trim():'';
        from = parseFloat(from);
        to = parseFloat(to);
        var target = (from + (to - from) * (now - start) / interval) + unit;
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
    var y = -1;
    if (top === true) {
      y = Math.max(offsetTop(ele) - padding - boardOffsetTop, 0);
    }
    else if (top === false) {
      var vp = getViewport();
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
          var t = xhr.responseText;
          var parser = new DOMParser();
          var doc = parser.parseFromString(t, "text/html");
          var eleArray = doc.querySelectorAll('.article-metaline, .article-metaline-right, .f2, .push');
          for (var i=0 ; i<eleArray.length ; i++) {
            eleArray[i].parentNode.removeChild(eleArray[i]);
          }
          var content = doc.getElementById('main-content');
          if (content) {
            content.setAttribute('id', 'preview-' + content.getAttribute('id'));
            document.getElementById('preview').innerHTML = '';
            document.getElementById('preview').appendChild(content.cloneNode(true));
          }
          doc = null;
        }
        xhr = null;
      }
    };

    xhr.open('GET', ele.href, true);
    xhr.send();
  }
}

function unselect() {
  var link = getSelectedLink();
  if (link) {
    link.className = link.className.replace(/\s*ellab\-selected\s*/, '');
    if (!link.className) {
      link.removeAttribute('class');
    }
  }
}

function getNextLink(isUp) {
  var links = getLinks();
  if (links.length === 0) {
    return null;
  }

  var curr = getSelectedLink();
  if (curr === null) {
    return links[0];
  }

  var prev = null;
  for (var i=0 ; i<links.length ; i++) {
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
  if (e.altKey || e.altGraphKey || e.ctrlKey || e.metaKey) {
    return;
  }

  var preview = document.getElementById('preview');
  var expandedPreview = preview.getAttribute('data-ellab-preview-expanded');

  if (e.keyCode === 13) {
    e.preventDefault();
    e.stopPropagation();

    var curr = getSelectedLink();
    if (curr) {
      curr.click();
    }
  }
  else if ((expandedPreview || e.shiftKey) && (e.keyCode === 38 || e.keyCode === 40)) {
    // preview is expanded then up, down, or shift-up, shift-down, scroll the preview

    e.preventDefault();
    e.stopPropagation();

    if (!preview.getAttribute('ellab-original-offset-top')) {
      preview.setAttribute('ellab-original-offset-top', preview.offsetTop);
    }

    // scroll 20% of page normally, large scroll (80%) if shift- and in expanded preview
    var scrollPageSize = (expandedPreview && e.shiftKey)?0.8:0.2;
    var originalOffsetTop = parseInt(preview.getAttribute('ellab-original-offset-top'), 10);
    var vp = getViewport();
    var previewHeight = vp.bottom - vp.top - originalOffsetTop;
    var scrollHeight = previewHeight - Math.max(20, previewHeight * (1 - scrollPageSize));

    var tm = preview.style.marginTop || 0;
    tm = parseInt(tm, 10);
    if (e.keyCode === 38) {
      // up key
      tm = Math.min(0, tm + scrollHeight);
    }
    else {
      // down key
      tm = Math.max(-preview.offsetHeight + previewHeight, tm - scrollHeight);
    }
    animate(preview, { marginTop: tm }, 200);
  }
  else if ((expandedPreview && (e.keyCode === 27 || e.keyCode === 32)) || (!e.shiftKey && e.keyCode === 37)) {
    // expanded preview, then press esc, space, or left, collapse preview

    e.preventDefault();
    e.stopPropagation();

    preview.removeAttribute('data-ellab-preview-expanded');
    preview.style.marginTop = 0;

    animate(preview, { width: 400 }, 200);
    document.querySelector('.r-list-container.bbs-screen').className =
      document.querySelector('.r-list-container.bbs-screen').className.replace(/\s+back/, '');
  }
  else if ((!expandedPreview && e.keyCode === 32) || (!e.shiftKey && e.keyCode === 39)) {
    // collapsed preview, then press space, or right, expand preview

    e.preventDefault();
    e.stopPropagation();

    preview.setAttribute('data-ellab-preview-expanded', true);

    var oldWidth = preview.style.width;
    preview.style.width = '100%';
    var widthPx = parseInt(window.getComputedStyle(preview).width, 10);
    preview.style.width = oldWidth;

    animate(preview, { width: widthPx * 0.8 }, 200);
    document.querySelector('.r-list-container.bbs-screen').className =
      document.querySelector('.r-list-container.bbs-screen').className.replace(/\s+back/, '') + ' back';
  }
  else if (e.keyCode === 38 || e.keyCode === 40) {
    // up, down, scroll the links
    e.preventDefault();
    e.stopPropagation();

    var link = getNextLink(e.keyCode === 38);
    unselect();
    select(link);
    ensureVisible(link, e.keyCode === 38);
  }
  else if (e.keyCode === 35) {
    // end key
    e.preventDefault();
    e.stopPropagation();

    var endlinks = getLinks();
    if (endlinks.length) {
      unselect();
      select(endlinks[endlinks.length - 1]);
      ensureVisible(endlinks[endlinks.length - 1], false);
    }
  }
  else if (e.keyCode === 36) {
    // home key
    e.preventDefault();
    e.stopPropagation();

    var homeLinks = getLinks();
    if (homeLinks.length) {
      unselect();
      select(homeLinks[0]);
      ensureVisible(homeLinks[0], true);
    }
  }
  else if (e.shiftKey && e.keyCode === 39) {
    // shift-right key, next page
    e.preventDefault();
    e.stopPropagation();

    if (boardIndex) {
      var nextLink = document.querySelector('a[href*="index' + (boardIndex + 1) + '.html"]');
      if (nextLink) {
        nextLink.click();
      }
    }
  }
  else if (e.shiftKey && e.keyCode === 37) {
    // shift-left key, prev page
    e.preventDefault();
    e.stopPropagation();

    var prevLink = null;
    if (boardIndex) {
      prevLink = document.querySelector('a[href*="index' + (boardIndex - 1) + '.html"]');
    }
    else {
      prevLink = document.querySelector('.action-bar > .pull-right a:nth-child(2)');
    }
    if (prevLink) {
      prevLink.click();
    }
  }
}

function boardScroll(e) {
  var curr = getSelectedLink();
  if (curr && (curr.getAttribute('data-ensure-visible') || inViewport(curr))) {
    return;
  }

  unselect();

  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
    // you're at the bottom of the page
  }

  var links = getLinks();
  var i = 0;
  if (e.scrollDirection === SCROLL_DOWN) {
    for (i=0 ; i<links.length ; i++) {
      if (inViewport(links[i])) {
          select(links[i]);
          break;
      }
    }
  }
  else if (e.scrollDirection === SCROLL_UP) {
    for (i=links.length-1 ; i>=0 ; i--) {
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

  var curr = document.querySelector('.ellab-selected');

  if (e.keyCode === 37) {
    e.preventDefault();
    e.stopPropagation();

    history.go(-1);
  }
}

var res = document.location.href.match(/https?:\/\/(www\.)?ptt\.cc\/bbs\/.+\/index(\d*)\.html/);
if (res) {
  pageType = PAGE_TYPE_BOARD;
  boardIndex = parseInt(res[2], 10);
  boardOffsetTop = offsetTop(document.getElementById('main-container'));
  var div = document.createElement('div');
  div.setAttribute('id', 'preview');
  document.body.appendChild(div);

  var prevSelectedLink = null;
  var lastSelectedArticle = document.cookie.match(/ellabselectedarticle\=([^;]+)/);
  if (lastSelectedArticle) {
    prevSelectedLink = getLinkByHref(lastSelectedArticle[1]);
  }
  if (prevSelectedLink) {
    select(prevSelectedLink);
  }
  else {
    boardScroll({ scrollDirection: SCROLL_DOWN });
  }
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

})();
