"use strict";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(data) {
  const list = document.getElementById("list");
  const clearBtn = document.getElementById("clear");
  list.innerHTML = "";

  const groups = (data && data.groups) || [];
  clearBtn.disabled = groups.length === 0;

  if (groups.length === 0) {
    list.appendChild(el("div", "empty", "No wildcard-policy CloudFront URLs detected."));
    return;
  }

  groups.forEach(function (group) {
    const section = el("div", "group");
    section.appendChild(el("div", "group-page", group.pageUrl || "(unknown page)"));

    // Merge items sharing the same Resource pattern.
    const byPattern = {};
    const order = [];
    group.items.forEach(function (item) {
      let bucket = byPattern[item.resourcePattern];
      if (!bucket) {
        bucket = byPattern[item.resourcePattern] = [];
        order.push(item.resourcePattern);
      }
      if (bucket.indexOf(item.resourceUrl) === -1) bucket.push(item.resourceUrl);
    });

    order.forEach(function (pattern) {
      const card = el("div", "match");
      card.appendChild(el("div", "label", "Resource pattern"));
      card.appendChild(el("div", "pattern", pattern));

      byPattern[pattern].forEach(function (url) {
        const row = el("div", "url-row");

        const link = el("a", "cf-url", url);
        link.href = url;
        link.title = url;
        link.target = "_blank";
        row.appendChild(link);

        const del = el("button", "del-btn", "✕");
        del.title = "Delete this match";
        del.addEventListener("click", function () {
          chrome.runtime.sendMessage(
            { type: "deleteOne", pageUrl: group.pageUrl, resourceUrl: url },
            render
          );
        });
        row.appendChild(del);

        card.appendChild(row);
      });

      section.appendChild(card);
    });

    list.appendChild(section);
  });
}

document.getElementById("clear").addEventListener("click", function () {
  chrome.runtime.sendMessage({ type: "clearAll" }, render);
});

chrome.runtime.sendMessage({ type: "getMatches" }, function (response) {
  render(response || { groups: [] });
});
