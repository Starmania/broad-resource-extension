# CloudFront Wildcard Policy Detector

<img src="icons/icon_128.png" alt="extension icon" width="96" align="right" />

A **passive security analyser** for AWS CloudFront signed URLs.

It watches the requests your browser already makes, decodes any CloudFront signed
URL, and flags those whose policy grants a **wildcard `Resource`** (a `Resource`
containing `*`). A wildcard means one signature is valid for many objects — often a
whole path or distribution, which is broader than intended. This extension makes
such over-broad URLs easy to spot while you browse.

Passive means it only observes: it never blocks, modifies, or sends requests, and
nothing leaves your browser.

## What it does

- Watches request URLs via `webRequest`.
- Keeps only CloudFront **custom-policy** signed URLs — those carrying the `Policy`,
  `Signature`, and `Key-Pair-Id` query parameters.
- Decodes the `Policy`, parses its JSON, and checks each `Statement[].Resource` for
  a `*` wildcard.
- On a match, saves the **page URL** and the **full CloudFront URL** (max 5 per page).
- Click the toolbar icon to see matches, grouped by page and merged by resource
  pattern. A blue badge shows the count for the current page.

## How detection works

It decodes the `Policy` of each [custom-policy signed URL](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-creating-signed-url-custom-policy.html)
and flags any whose `Statement[].Resource` contains a `*`.

## Storage

Matches are kept between browser reboots. The popup lets you delete one (`✕`) or
clear all.

## Install

1. Open `chrome://extensions` (or `about:debugging` in Firefox).
2. Enable **Developer mode**.
3. **Load unpacked** → select this folder.

Requires a browser that still supports Manifest V2 (Firefox, or a Chromium build
with MV2 enabled).

## License

[Apache License 2.0](LICENSE).
