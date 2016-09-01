
set -exv


npm install
bower install the-graph

mkdir -p ./www
mkdir -p ./dist

npm run mytest
npm run build

# build the regl-pipeline-editor demo
cp -rf ./bower_components ./www/.
mkdir -p ./www/regl-pipeline-editor
cp -f ./regl-pipeline-editor/regl-pipeline-editor.html ./www/regl-pipeline-editor/.
browserify ./regl-pipeline-editor/regl-pipeline-editor.js > ./www/regl-pipeline-editor/regl-pipeline-editor.js

# build  regl-pipeline-demo
mkdir -p ./www/regl-pipeline-demo/
browserify ./regl-pipeline-demo.js > ./www/regl-pipeline-demo/regl-pipeline-demo.js
cat > ./www/regl-pipeline-demo/regl-pipeline-demo.html << EOL
<!DOCTYPE html><html lang="en"><head><title>regl-pipeline-demo</title><meta charset="utf-8"></head>
<body><script src="regl-pipeline-demo.js"></script></body></html>
EOL

