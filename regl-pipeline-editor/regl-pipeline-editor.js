
// const $ = require('jquery-browserify');
const regl = require('regl')();
const resl = require('resl');
const nunjucks = require('nunjucks');
const assert = require('assert');
const pipeline = require('../regl-pipeline.js');
const GitHub = require('github-api');


nunjucks.configure('views', {
    autoescape: true
});


Polymer.veiledElements = ["the-graph-editor"];
window.addEventListener('polymer-ready', function() {
  "use strict";


  $('body > canvas')
    .css('z-index:', '1000')
    .css('pointer-events', 'none')
    ;


  // Remove loading message
  document.body.removeChild( document.getElementById("loading") );


  // The graph editor
  var editor = document.getElementById('editor');
  // Component library
  var library = {
    none: {
      name: 'basic',
      description: 'basic demo component',
      icon: 'eye',
      inports: [
        {'name': '>in', 'type': 'all'}
      ],
      outports: [
        {'name': 'out>', 'type': 'all'}
      ]
    }
  };


  library['brute-gaussian'] = {
    name: 'Brute Gaussian',
    description: 'Brute Gaussian Filter',
    icon: 'gears',
    inports: pipeline.components['brute-gaussian'].inports,
    outports: pipeline.components['brute-gaussian'].outports
  };

  library.texture = {
    name: 'RESL/REGL Texture',
    description: 'Source texture loaded from resl',
    icon: 'image',
    inports: pipeline.components.texture.inports,
    outports: pipeline.components.texture.outports
  };

  library.framebuffer = {
    name: 'REGL FBO',
    description: 'FBO for writing',
    icon: 'television',
    inports: pipeline.components.framebuffer.inports,
    outports: pipeline.components.framebuffer.outports
  };

  library.canvas = {
    name: 'REGL Canvas',
    description: 'Draws to the regl canvas',
    icon: 'television',
    inports: pipeline.components.canvas.inports,
    outports: pipeline.components.canvas.outports
  };

  library.slider = {
    name: 'Slider',
    description: 'Choose a number',
    icon: 'sliders',
    inports: [{name: 'name'}, {name: 'min'}, {name: 'max'}, {name: 'step'}],
    outports: [{name: 'out'}]
  };

  // add all the components to the menu
  Object.keys(library).forEach(function(component){
    $('#addnode-menu').append($('<li>').append($('<a>').attr('href', '#').text(component)));
  });

  $('#addnode-menu').find('a').on('click', function(){
    let component = $(this).text();
    console.log('component:', component);
    addnode(component);
  });

  editor.$.graph.library = library;
  // Load empty graph
  let graph = {};
  editor.graph = graph;



  window.dag = pipeline.DAG({regl,resl,getNofloGraph: () => editor.nofloGraph, pipeline});


  var nav = document.getElementById('nav');
  nav.editor = editor;

  // Add node button
  var addnode = function (component) {
    var id = Math.round(Math.random()*100000).toString(36);
    var metadata = {
      label: component,
      x: 0,
      y: 0
    };
    var newNode = editor.nofloGraph.addNode(id, component, metadata);

    dag.initializeNode({node: newNode.id});
    return newNode;
  };
  $("#focus").on("click", function(){
    let selected = editor.selectedNodes;
    console.log('selected:',selected);
    if (selected.length === 0)
      return;

    editor.focusNode(selected[0]);
  });

  function clearSelected(){
    $('#selected-id').val('').trigger('change');
  }
  function setSelected(floNode){
    console.log('floNode:',floNode);
    $('#selected-id').val(floNode.id).trigger('change');
  }

  function getInEdges(node, inport) {
    
    let resultEdges = [];
    for (let edge of editor.nofloGraph.edges) {
      if (edge.to.node === node && edge.to.port === inport) {
        resultEdges.push(edge);
      }
    }

    return resultEdges;
  }

  function getInitializer(node, inport) {
    for (let initializer of editor.nofloGraph.initializers) {
      if (initializer.to.node === node && initializer.to.port === inport) {
        return initializer;
      }
    }
    return undefined;
  }


  // stop all events from propogating from the #testing div up to the graph
  $('#testing').on('keydown keypress keyup', function(e) {
    e.stopPropagation();
  });

  $('#selected-id').on('change', function(){
    let node = $('#selected-id').val();
    console.log('selected, id:',node);

    $('#selected-node-props').empty();
    if (node === undefined || node === null || node.length === 0) {
      $('#execute-node').prop('disabled', true);
      $('#compile-node').prop('disabled', true);
      return;
    }


    $('#execute-node').prop('disabled', false);
    $('#compile-node').prop('disabled', false);




    let nofloNode = editor.nofloGraph.getNode(node);

    let metadata = nofloNode.metadata;

    console.log('nofloNode:',nofloNode);

    let $tr = $('<tr>').appendTo($('#selected-node-props'));
    let $th = $('<th>').appendTo($tr).text('node');
    let $td = $('<td>').appendTo($tr).text(node);

    let componentInfo = editor.getLibrary()[nofloNode.component];

    for (let inportInfo of componentInfo.inports){
      let inport = inportInfo.name;

      console.log(JSON.stringify(editor.nofloGraph.initializers));

      let {value,usage} = dag.getAttached({node,inport});

      console.log(`inport ${inport}, attached value: ${value}, usage: ${usage}`);

      if (value !== undefined) {
        value = JSON.stringify(value);
      }

      let template = `
      <tr>
        <th>{{inport}}</th>
        <td>
          <div class="input-group">
            <select class="regl-pipeline-port-attached-usage form-control input-group-addon">
              <option value="usage">usage</option>
              <option {% if usage == 'static' %}selected="selected"{% endif %} value="static" title="Changing the value will require recompilation of parts of the pipeline">static</option>
              <option {% if usage == 'dynamic' %}selected="selected"{% endif %} value="dynamic" title="Easily change this value later">dynamic</option>
            </select>
            <span class="input-group-addon"></span> 
            <input type="text" class="regl-pipeline-port-attached form-control input-group-addon" aria-label="..." placeholder="value (use JSON)" value="{{value}}">
          </div><!-- /input-group -->

        </td>
      </tr>
      `;

      let $tr = $(nunjucks.renderString(template, {inport, value, usage})).appendTo($('#selected-node-props'));

      let $usage = $tr.find('.regl-pipeline-port-attached-usage');

      let $attached = $tr.find('input.regl-pipeline-port-attached');

      $usage.on('change', function(){
        updateAttached();
      });

      $attached.on('change', function(){
        updateAttached();
      });

      console.log('$attached.val():',$attached.val());
      updateAttached();

      function updateAttached(){
        let value = $attached.val();

        console.log('inport:', inport, ', $attached.val(): ', $attached.val());
        value = value.trim();

        let usage = $usage.val();

        if (value.length === 0) {
          dag.removeAttached({node, inport});
          return;
        } else if(value === 'undefined') {
          value = undefined;
        } else if(value === 'null') {
          value = null;
        } else if(value === 'true') {
          value = true;
        } else if(value === 'false') {
          value = false;
        } else {
          try {
            value = JSON.parse(value);
          } catch (e) {


            $($attached).addClass('alert alert-danger');
            return;
          }
        }
        $($attached).removeClass('alert alert-danger');

        if (usage !== 'static' && usage !== 'dynamic') {
          $($attached).addClass('alert alert-danger');
          return;
        }
        $($attached).removeClass('alert alert-danger');


        try {
          dag.setAttached({node,inport,value, usage});
        } catch (e) {
          $($attached).addClass('alert alert-danger');
        }

        // dag.setInitializer({node,inport,value: data, usage});

        // let metadata = {usage};


        // editor.nofloGraph.removeInitial(node, port.name);

        // TODO: sometimes we want to replace, not addInitial(), does
        // addInitial() take care of that for us?
        // also think about metadata
        // editor.nofloGraph.addInitial(data, node, port.name, metadata);
      }

    }


  });
  
  // set some defaults when the selected node is empty.
  $('#selected-id').trigger('change');

  $(editor).on('nodes', function(){
    let selected = editor.selectedNodes;

    if (selected.length === 0) {
      clearSelected();
      return;
    }

    if (selected.length === 1) {
      setSelected(selected[0]);
      return;
    }


  })

  // Autolayout button
  $("#autolayout").on("click", function () {
    editor.triggerAutolayout();
  });
  
  function resetStoredGraphs(){
    window.localStorage.storedGraphs = JSON.stringify([]);
  }

  function getStoredGraphs(){
    if (!window.localStorage.hasOwnProperty('storedGraphs')) {
      return [];
    }

    try{
      return JSON.parse(window.localStorage.storedGraphs);
    } catch(e){
      return [];
    }
  }

  // save to storage button
  $("#save-graph-to-storage").on("click", function () {
    var graphJSON = JSON.stringify(editor.nofloGraph);
    

    let storedGraphs = getStoredGraphs();

    storedGraphs.push({graphJSON, date: new Date()});

    window.localStorage.storedGraphs = JSON.stringify(storedGraphs);
  });


  function loadGraph({graph}){
    editor.graph = graph;

    // clear the cache
    setTimeout(function(){
      for (let nofloNode of editor.nofloGraph.nodes) {
        let node = nofloNode.id;

        dag.clearCache({node});
      }
    })
  }

  // load from storage button
  $("#load-graph-from-storage").on("click", function () {
    let storedGraphs = getStoredGraphs();
    storedGraphs.reverse();

    $('#stored-graph-list').empty();

    storedGraphs.forEach(function(storedGraph, i){
      let $graphButton = $('<a class="list-group-item">').text(storedGraph.date);

      $graphButton.attr('data-stored-graph-index', i);
      $('#stored-graph-list').append($graphButton);
    });

    assert($('#stored-graph-list > .list-group-item').length === storedGraphs.length);

    $('#stored-graph-list > .list-group-item').on('click', function(){
      $('#stored-graph-list > .list-group-item').removeClass('active');
      $(this).addClass('active');
      $('#stored-graph-modal-submit').removeClass('disabled');
    });

    $('#stored-graph-modal-submit').addClass('disabled');

    if (storedGraphs.length > 0){
      $('#stored-graph-list > .list-group-item').eq(0).click();
    }

    $('#stored-graph-modal-alert').hide();
    $('#stored-graph-modal').modal('show');

    $('#stored-graph-modal-submit').on('click', function(){
      let $active = $('#stored-graph-list > .list-group-item.active');
      console.log('active:',$active)

      if ($active.length === 0) {
        
        $('#stored-graph-modal-alert').text('Nothing selected').show();
        return;
      }


      let i = parseInt($active.attr('data-stored-graph-index'));
      let storedGraph = storedGraphs[i];
      let graphJSON = storedGraph.graphJSON;

      try {
        graphJSON = JSON.parse(graphJSON);
      } catch(e) {
        $('#stored-graph-modal-alert').text('Error parsing graph').show();
        return;
      }

      console.log(graphJSON);

      graph = graphJSON;
      loadGraph({graph});

      $('#stored-graph-modal').modal('hide');
    });
  });

  $('#compile-node').on('click', function(){

    let selected = editor.selectedNodes;

    for (let nofloNode of selected) {
      let node = nofloNode.id;
      editor.removeErrorNode(node);
      editor.updateErrorNodes();
      Promise.resolve()
        .then(function(){
          return Promise.resolve(dag.pullStatic({node}));
        })
        .then(function(){
          return Promise.resolve(dag.compile({node, force: true}));
        })
        .then(function(){
          return Promise.resolve(dag.execute({node, runtime: 'static', force: true}));
        })
        .catch(function(err){
          console.error(err);
          editor.addErrorNode(node);
          editor.updateErrorNodes();
        });
    }
  });

  $('#execute-node').on('click', function(){

    let selected = editor.selectedNodes;

    for (let nofloNode of selected) {
      let node = nofloNode.id;

      editor.removeErrorNode(node);
      editor.updateErrorNodes();
      Promise.resolve()
        // .then(function(){
        //   return dag.execute({node, runtime: 'static'});
        // })
        .then(function(){
          return dag.pullDynamic({node});
        })
        .then(function(){
          return dag.execute({node, runtime: 'dynamic'});
        })
        .catch(function(err){
          console.error(err);
          editor.addErrorNode(node);
          editor.updateErrorNodes();
        });
    }
  });

  $('#execute-all').on('click', function(){

    // clear all error nodes.
    for (let node of dag.ordering()){
      editor.removeErrorNode(node);
    }
    editor.updateErrorNodes();

    function failure(err, node){
      console.error(err);
      editor.addErrorNode(node);
    }

    Promise.resolve()
      .then(function(){
        return dag.compileFrame({force: false, failure, parallel: false});
      })
      .then(function(results){
        return dag.executeFrame({failure, parallel: false});
      })
      .then(function(){

      })
      .catch(function(err){
        editor.updateErrorNodes();
        console.error(err);
      });

  });

  $('#clear-node-cache').on('click', function(){

    let selected = editor.selectedNodes;

    for (let nofloNode of selected) {
      let node = nofloNode.id;

      dag.clearCache({node});
    }
  });

  $('#clear-graph-cache').on('click', function(){
    for (let nofloNode of editor.nofloGraph.nodes) {
      let node = nofloNode.id;

      dag.clearCache({node});
    }
  });


  $('#redify').on('click', function(){

    let selected = editor.selectedNodes;

    for (let nofloNode of selected) {
      let node = nofloNode.id;
      editor.addErrorNode(node);
      editor.updateErrorNodes();
    }

  });


  // Get graph button
  document.getElementById("get").addEventListener("click", function () {
    var graphJSON = JSON.stringify(editor.nofloGraph);
    $('#graph-source-textarea').val(graphJSON);
    $('#graph-source-modal').modal('show');
  });

  // Clear button
  document.getElementById("clear").addEventListener("click", function () {
    graph = {};
    editor.graph = graph;
  });


  window.gh = new GitHub();
  $(window).on('hashchange', function(e){
    let hash = location.hash.slice(1);
    if (hash.startsWith('gist/')){
      let [_,gistid,path] = hash.split('/');



      let gist = gh.getGist(gistid);

      // clear graph
      graph = {};
      editor.graph = graph;

      gist.read()
        .then(function(data){
          console.log(data);

          let files = data.data.files;

          if (path === undefined) {
            if (Object.keys(files).length > 0) {
              path = Object.keys(files)[0];
            }
          }

          if (!files.hasOwnProperty(path)) {
            throw new Error(`cannot find file at path "${path}" in gist "${gistid}"`);
          }


          if (true || files[path].truncated) {
            return $.ajax({url: files[path].raw_url})
              .then(function(graphJSON){
                let graph = JSON.parse(graphJSON);
                loadGraph({graph});
              })
          } else {
            let graphJSON = files[path].content;
            let graph = JSON.parse(graphJSON);
            loadGraph({graph});
          }
        

        }).catch(function(err){
          console.error(err);
          alert(`Unable to retrieve gist id=${gistid}, ${JSON.stringify(err)}`);
        });

    }
  });

  // trigger a hashchange event to initialize stuff to the initial hash
  setTimeout(function(){
    $(window).trigger('hashchange');
  });

  // Resize to fill window and also have explicit w/h attributes
  var resize = function () {
    editor.setAttribute("width", window.innerWidth);
    editor.setAttribute("height", window.innerHeight);
  };
  window.addEventListener("resize", resize);


  resize();
});
