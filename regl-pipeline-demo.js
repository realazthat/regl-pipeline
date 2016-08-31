
const regl = require('regl')({
  extensions: ['OES_texture_float']
});
const resl = require('resl');

const $ = require('jquery');
const pipeline = require('./regl-pipeline.js');
const noflo = require('noflo');

$(document).ready(function () {
  $('canvas').css('z-index', '-5');
  $('body').append($('<input>').attr('type', 'range').attr('min', '0.1').attr('value', '0.1').attr('max', '255').attr('step', '0.1').attr('id', 'sigma'));
  $('body').append($('<input>').attr('type', 'range').attr('min', '0').attr('value', '1').attr('max', '255').attr('step', '1').attr('id', 'radius'));

  let nofloGraph = new noflo.graph.Graph('wat');

  function getNofloGraph () {
    return nofloGraph;
  }

  let dag = pipeline.DAG({regl, resl, getNofloGraph, pipeline});

  // so we can access stuff easily from the console.
  window.dag = dag;

  nofloGraph.addNode('src-texture', 'texture', {});
  nofloGraph.addNode('fbo', 'framebuffer', {});
  nofloGraph.addNode('blur', 'brute-gaussian', {});
  nofloGraph.addNode('sink-canvas', 'canvas', {});

  for (let node of dag.nodes()) {
    dag.initializeNode({node});
  }

  dag.setAttached({ node: 'src-texture', inport: 'src', usage: 'static',
                    value: 'https://raw.githubusercontent.com/realazthat/glsl-gaussian/master/assets/Storm%20Cell%20Over%20the%20Southern%20Appalachian%20Mountains-dsc_2303_0-256x256.png'});
  nofloGraph.addEdge('src-texture', 'outresolution', 'blur', 'inresolution');
  nofloGraph.addEdge('src-texture', 'outviewport', 'blur', 'inviewport');
  nofloGraph.addEdge('src-texture', 'out', 'blur', 'in');

  nofloGraph.addEdge('src-texture', 'outresolution', 'fbo', 'inresolution');

  nofloGraph.addEdge('fbo', 'out', 'blur', 'framebuffer');
  nofloGraph.addEdge('fbo', 'outresolution', 'blur', 'outresolution');
  nofloGraph.addEdge('fbo', 'outviewport', 'blur', 'outviewport');

  dag.setAttached({node: 'blur', inport: 'sigma', value: 3, usage: 'dynamic'});
  dag.setAttached({node: 'blur', inport: 'radius', value: 3, usage: 'static'});
  nofloGraph.addEdge('blur', 'out', 'sink-canvas', 'in');
  nofloGraph.addEdge('blur', 'outviewport', 'sink-canvas', 'inviewport');
  nofloGraph.addEdge('blur', 'outresolution', 'sink-canvas', 'inresolution');

  function failure (err, node) {
    console.error(`error for node ${node}`, err);
  }

  dag.compileFrame({failure, force: true, parallel: false})
    .then(function () {
      regl.frame(function () {
        dag.executeFrameSync({failure, parallel: false});
      });
    });
});
