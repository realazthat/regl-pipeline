
const fs = require('fs');
const mkdirp = require('mkdirp');
const ncp = require('ncp');
const browserify = require('browserify');

function buildADemo ({BUILDDIR, MAINJSSRC, MAINJSDST, MAINHTMLFILE, TITLE, assets = []}) {
  const HTMLCONTENT = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${TITLE}</title>
    <!--[if IE]>
      <script src="http://html5shiv.googlecode.com/svn/trunk/html5.js"></script>
    <![endif]-->
  </head>
  <body>

  <script src="./${MAINJSDST}"></script>
  </body>
  </html>
  `;

  mkdirp(BUILDDIR, function (err) {
    if (err) {
      throw err;
    }
    // ncp('assets', `${BUILDDIR}/assets`, function (err) {
    //   if (err) {
    //     throw err;
    //   }
    // });

    let b = browserify({debug: true});
    b.add(MAINJSSRC);
    b.bundle(function (err, bundle) {
      if (err) {
        throw err;
      }
      console.log('bundled', MAINJSSRC);

      fs.writeFile(`${BUILDDIR}/${MAINJSDST}`, bundle, function (err) {
        if (err) {
          throw err;
        }
      });
    });

    for (let asset of assets) {
      ncp(asset, `${BUILDDIR}/${asset}`, function (err) {
        if (err) {
          throw err;
        }
      });
    }

    if (MAINHTMLFILE) {
      fs.writeFile(`${BUILDDIR}/${MAINHTMLFILE}`, HTMLCONTENT, function (err) {
        if (err) {
          throw err;
        }
      });
    }
  });
}

module.exports = {buildADemo};
