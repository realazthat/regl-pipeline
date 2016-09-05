

const regl = require('regl')({
  extensions: ['OES_texture_float']
});
const resl = require('resl');
const $ = require('jquery');
const pipeline = require('../regl-pipeline');
const noflo = require('noflo');
const nunjucks = require('nunjucks');

$(document).ready(function(){
  // put the canvas in front of everything, but don't let it interfere with the
  // input events and steal focus etc.
  $('body > canvas')
      .css('z-index:', '1000')
      .css('pointer-events', 'none');

  // initialize the graph model
  let nofloGraph = new noflo.graph.Graph({options: {caseSensitive: true}});
  function getNofloGraph(){
    return nofloGraph;
  }

  // initialize the DAG/pipeline
  let dag = pipeline.DAG({regl, resl, getNofloGraph, pipeline, $});

  // so we can access stuff easily from the console.
  window.dag = dag;

  // create a few nodes
  dag.n('src', 'texture');
  dag.n('fbo', 'framebuffer');
  dag.n('blur', 'brute-gaussian');
  dag.n('sink', 'canvas');
  // hardcode some values on to the texture
  dag.n('src').i.src = 'https://raw.githubusercontent.com/realazthat/glsl-gaussian/master/assets/Storm%20Cell%20Over%20the%20Southern%20Appalachian%20Mountains-dsc_2303_0-256x256.png';
  // obtain the resolution for the fbo from src
  dag.n('fbo').i.inresolution = dag.n('src').o.outresolution;
  // connect src to blur
  dag.n('blur').i.in = dag.n('src').o.out;
  dag.n('blur').i.inresolution = dag.n('src').o.outresolution;
  dag.n('blur').i.inviewport = dag.n('src').o.outviewport;
  // set the radius
  dag.n('blur').i.radius = 3;
  // make it dynamic and controllable from the properties page.
  dag.n('blur').i.sigma = pipeline.Dynamic(3, {type: 'frange', params: {min: 0.1, max: 16, step: 0.1}});
  // the blur will write to the fbo
  dag.n('blur').i.outresolution = dag.n('fbo').o.outresolution;
  dag.n('blur').i.outviewport = dag.n('fbo').o.outviewport;
  dag.n('blur').i.framebuffer = dag.n('fbo').o.out;

  dag.n('sink').i.in = dag.n('blur').o.out;
  dag.n('sink').i.inresolution = dag.n('blur').o.outresolution;
  dag.n('sink').i.inviewport = dag.n('blur').o.outviewport;


  // a container element to let us control dynamic attachments/properties.
  let $props = $('<div />').appendTo($('body'));

  // a callback in case an error occurs at a node.
  function failure (err, node) {
    console.error(`error for node ${node}`, err);
  }

  // compile the DAG/pipeline
  dag.compileFrame({failure, force: true, parallel: false})
    .then(function () {
      // bind the properties to corresponding DOM inputs
      dag.renderProps({$, nunjucks, element: $props});

      // set a per-frame callback.
      regl.frame(function () {
        // update the properties to corresponding DOM inputs
        dag.renderProps({$, nunjucks, element: $props});

        // clear the buffer
        regl.clear({
          color: [0, 0, 0, 0],
          depth: 1,
          stencil: 0
        });

        // execute the pipeline
        dag.executeFrameSync({failure});
      });
    });
});
