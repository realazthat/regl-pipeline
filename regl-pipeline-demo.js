
const regl = require('regl')({
  extensions: ['OES_texture_float']
});
const resl = require('resl');

const $ = require('jquery-browserify');
const pipeline = require('./regl-pipeline.js');

$(document).ready(function () {
  $('canvas').css('z-index', '-5');
  $('body').append($('<input>').attr('type', 'range').attr('min', '0.1').attr('value', '0.1').attr('max', '255').attr('step', '0.1').attr('id', 'sigma'));
  $('body').append($('<input>').attr('type', 'range').attr('min', '0').attr('value', '1').attr('max', '255').attr('step', '1').attr('id', 'radius'));

  function getNofloGraph () {

  }

  let dag = pipeline.DAG({regl, resl, getNofloGraph, pipeline});

  dag.compileFrame();
});
