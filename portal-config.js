// Where the public forms send submissions: the RAM HQ Apps Script web app URL.
// Leave blank to keep every form in preview mode (nothing is sent).
// See apps-script/README.md for how to get this URL.
window.BRYC_PORTAL = {
  submitUrl: 'https://script.google.com/macros/s/AKfycbyM-d6orJlQzrAQN8W7AZiBWB-3oyFgSxtsmXZmKxkyiYVjz_nRrRL6UWq5ORJMpqYqzQ/exec',
  // Which school years are open, and when, is set by PORTAL.applicationWindows in
  // Portal.gs. The portal gets the open years from RAM HQ when a family signs in.
};
