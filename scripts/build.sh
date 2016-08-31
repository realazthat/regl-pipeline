
set -exv


npm install
bower install the-graph

mkdir -p ./www
mkdir -p ./dist

cp -rf ./bower_components ./www/.
mkdir -p ./www/regl-pipeline-editor
cp -f ./regl-pipeline-editor/regl-pipeline-editor.html ./www/regl-pipeline-editor/.
browserify ./regl-pipeline-editor/regl-pipeline-editor.js > ./www/regl-pipeline-editor/regl-pipeline-editor.js


