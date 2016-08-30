
const clone = require('clone');
const assert = require('assert');
const ExtendableError = require('es6-error');

// 1. pull static data in to each inport and place it in cache
//    * check if source changed, usage changed etc. if so mark it as statically changed for this frame
// 2. run compilation outports
//    * check if it needs to be run by checking last compiled frame/time vs cached inport static frame times
//    * optional force parameter; this is true when the user presses compile, clears the cache first.
//    * retreives inputs from input cache
// 3. run static outports
//    * check if it needs to be run by checking outport cache frame/time vs cached inport static frame times
//    * optional force parameter; this is true when the user presses compile, clears the output cache first.
//    * retreives inputs from input cache
//    * retreives anything compiled from compile cache
// 4. pull dynamic data in to each inport and place it in cache
//    * check if source changed, usage changed etc. if so mark it as statically changed for this frame
// 5. run dynamic outports
//    * retreives inputs from input cache
//    * retreives anything compiled from compile cache

class OutportDoesNotContainData extends ExtendableError {
  constructor ({component, node, outport}) {
    super(`${component}/${node}:${outport} has no data; you should probably run that node first`);
    this.node = node;
    this.outport = outport;
  }
}

class InportDoesNotContainCache extends ExtendableError {
  constructor ({component, node, inport}) {
    super(`${inport}:${component}/${node} has no data; something went wrong`);
    this.node = node;
    this.inport = inport;
  }
}

function computeEdgesToMap ({V, E}) {
  let result = new Map();

  for (let v of V) {
    if (!result.has(v)) {
      result.set(v, new Set());
    }
  }

  for (let [u, v] of E) {
    if (!result.has(u)) {
      result.set(u, new Set());
    }

    result.get(u).add(v);
  }

  return result;
}

function computeRoots ({V, E}) {
  let S = new Set(V);

  for (let [, destinations] of E.entries()) {
    for (let v of destinations) {
      S.delete(v);
    }
  }

  return S;
}

// returns a level-order, a list of levels of nodes, in a topological sort.
function computeLevelOrder ({V, E}) {
  // set of nodes with no incoming edges
  let roots = computeRoots({V, E});

  if (roots.size === 0) {
    throw new Error('Graph has no roots!');
  }

  let tovisit = new Set(roots);
  let levels = [Array.from(roots)];
  let count = roots.size;

  // count how many parents each node has.
  let parents = new Map(Array.from(V).map((v) => [v, (0 | 0)]));

  for (let [, destinations] of E.entries()) {
    for (let v of destinations) {
      parents.set(v, (parents.get(v) | 0) + (1 | 0));
    }
  }

  while (tovisit.size) {
    let level = new Set();

    for (let v of tovisit) {
      for (let child of E.get(v)) {
        let childParents = parents.get(child) | 0;

        if (childParents <= 0) {
          throw new Error('Something is wrong with this graph ...');
        }

        childParents -= (1 | 0);

        parents.set(child, childParents | 0);

        if (childParents === 0) {
          level.add(child);
          count += 1;
        }
      }
    }

    levels.push(Array.from(level));
    tovisit = level;
  }

  if (count !== V.size) {
    throw new Error('Something is wrong with this graph ...');
  }

  return levels;
}

class NodeExecutionContext {
  constructor ({node, outport, dag, runtime}) {
    this.dag = dag;
    this.regl = dag.regl;
    this.resl = dag.resl;
    this.node = node;
    this.outport = outport;
    this.runtime = runtime;
  }

  compiled (outport = null) {
    let dag = this.dag;
    let node = this.node;

    if (outport === null) {
      outport = this.outport;
    }

    let metadata = this.dag.metadata({node});
    if (!metadata || !metadata.cached || !metadata.cached.compiled || !metadata.cached.compiled[outport]) {
      throw new Error(`No compiled values available for ${dag.portStr({node, outport})}`);
    }

    return metadata.cached.compiled[outport].value;
  }

  checkInport ({inport}) {
    let dag = this.dag;
    let node = this.node;
    let outport = this.outport;
    let depends = new Set(dag.depends({node, outport}));

    if (!dag.hasInport({node, inport})) {
      throw new Error(`Cannot evaluate inport "${inport}"; component ${dag.portStr({node, outport})} has no such inport`);
    }

    if (!depends.has(inport)) {
      throw new Error(`Cannot evaluate inport "${inport}"; ${dag.portStr({node, outport})} is not dependent on this inport`);
    }
  }

  usage (inport) {
    this.checkInport({inport});

    let dag = this.dag;
    let node = this.node;

    let {usage} = dag.getCachedInport({node, inport});

    return usage;
  }

  connected (inport) {
    this.checkInport({inport});

    let dag = this.dag;
    let node = this.node;

    let {source} = dag.getCachedInport({node, inport});

    return source !== 'none';
  }

  require (inport) {
    this.checkInport({inport});

    let dag = this.dag;
    let node = this.node;

    if (!this.connected(inport)) {
      throw new Error(`${dag.portStr({node, inport})} is not connected`);
    }

    return this.evaluate(inport);
  }

  /**
   * Statically require.
   */
  statically (inport) {
    this.checkInport({inport});

    let dag = this.dag;
    let node = this.node;

    if (!this.connected(inport)) {
      throw new Error(`${dag.portStr({node, inport})} is not connected`);
    }

    if (dag.effectiveInportUsage({node, inport}) !== 'static') {
      throw new Error(`${dag.portStr({node, inport})} cannot be evaluated statically`);
    }

    return this.evaluate(inport);
  }

  evaluate (inport) {
    this.checkInport({inport});

    let dag = this.dag;
    let node = this.node;

    let {usage, value} = dag.getCachedInport({node, inport});

    if (this.runtime === 'static' && usage === 'dynamic') {
      // TODO: throw an error here?
      return undefined;
    }

    return value;
  }
}

class DAG {
  constructor ({regl, resl, getNofloGraph, pipeline}) {
    this.regl = regl;
    this.resl = resl;
    this.getNofloGraph = getNofloGraph;
    this.pipeline = pipeline;
    this.frame = 0 | 0;
    this.counter = 0 | 0;
  }

  component ({node}) {
    return this._nofloNode({node}).component;
  }

  componentInfo ({node = null, component = null}) {
    if (component === null) {
      component = this.component({node});
    }

    let componentInfo = this.pipeline.components[component];
    if (!componentInfo) {
      throw new Error(`No pipeline component found named "${component}"`);
    }

    return componentInfo;
  }

  inports ({node = null, component = null}) {
    let componentInfo = this.componentInfo({node, component});

    return componentInfo.inports.map((inportInfo) => inportInfo.name);
  }

  outports ({node = null, component = null}) {
    let componentInfo = this.componentInfo({node, component});

    return componentInfo.outports.map((outportInfo) => outportInfo.name);
  }

  depends ({node = null, component = null, outport}) {
    let componentOutportInfo = this.componentOutportInfo({node, component, outport});

    if (componentOutportInfo.pass) {
      let componentInportInfo = this.componentInportInfo({node, component, inport: outport});
      return [componentInportInfo.name];
    }

    if (componentOutportInfo.depends === undefined) {
      return [];
    }

    return clone(componentOutportInfo.depends);
  }

  componentInportInfo ({node = null, component = null, inport}) {
    let componentInfo = this.componentInfo({node, component});

    for (let inportInfo of componentInfo.inports) {
      if (inportInfo.name === inport) {
        return inportInfo;
      }
    }

    throw new Error(`Cannot find inport "${inport}" on node "${node}" (of component ${this.component({node})}`);
  }

  componentOutportInfo ({node = null, component = null, outport}) {
    let componentInfo = this.componentInfo({node, component});

    for (let outportInfo of componentInfo.outports) {
      if (outportInfo.name === outport) {
        return outportInfo;
      }
    }

    throw new Error(`Cannot find inport "${outport}" on node "${node}" (of component ${this.component({node})}`);
  }

  checkInport ({node, inport}) {
    // this will error if the inport does not exist
    this.componentInportInfo({node, inport});
  }

  checkOutport ({node, outport}) {
    // this will error if the outport does not exist
    this.componentOutportInfo({node, outport});
  }

  hasAttached ({node, inport}) {
    this.checkInport({node, inport});

    let nofloInitialValue = this._nofloGetInitialValue({node, inport});
    return nofloInitialValue !== undefined;
  }

  checkAttachedUsage ({usage}) {
    if (usage !== 'static' && usage !== 'dynamic') {
      throw new Error(`Cannot set usage for attached value to "${usage}"; only 'static' and 'dynamic' are valid.`);
    }
  }

  setAttached ({node, inport, value, usage}) {
    // this.checkInport({node, inport});
    this.checkAttachedUsage({usage});

    let inportUsage = this.componentInportInfo({node, inport}).usage;
    if (inportUsage === 'static' && usage === 'dynamic') {
      throw new Error(`Cannot set "${usage}" on ${this.portStr({node, inport})}, inport is typed as usage ${inportUsage}`);
    }

    let metadata = this.metadata({node, setup: true});
    if (metadata.attached === undefined) {
      metadata.attached = {};
    }

    let staticChanged = metadata.attached[inport].staticChanged;
    let valueChanged = this.frame;

    if (staticChanged === undefined) {
      staticChanged = this.frame;
    }

    if (usage === 'static') {
      staticChanged = this.frame;
    }

    if (usage !== metadata.attached[inport].usage) {
      staticChanged = this.frame;
    }

    metadata.attached[inport] = {value, usage, valueChanged, staticChanged};

    this.getNofloGraph().removeInitial(node, inport);
    this.getNofloGraph().addInitial(value, node, inport, {});
  }

  getAttached ({node, inport}) {
    let value = this._nofloGetInitialValue({node, inport});
    let metadata = this.metadata({node});

    let usage = 'static';
    let valueChanged;
    let staticChanged;

    if (metadata !== undefined && metadata.attached !== undefined && metadata.attached[inport] !== undefined) {
      usage = metadata.attached[inport].usage;
      valueChanged = metadata.attached[inport].valueChanged;
      staticChanged = metadata.attached[inport].staticChanged;
    }

    return {value, usage, valueChanged, staticChanged};
  }

  removeAttached ({node, inport}) {
    let metadata = this.metadata({node});
    if (metadata !== undefined && metadata.attached !== undefined && metadata.attached[inport] !== undefined) {
      delete metadata.attached[inport];
    }

    this.getNofloGraph().removeInitial(node, inport);
  }

  hasInportConnection ({node, inport}) {
    for (let nofloEdge of this.getNofloGraph().edges) {
      if (nofloEdge.to.node === node && nofloEdge.to.port === inport) {
        return true;
      }
    }
    return false;
  }

  getInportConnection ({node, inport}) {
    for (let nofloEdge of this.getNofloGraph().edges) {
      if (nofloEdge.to.node === node && nofloEdge.to.port === inport) {
        return {outnode: nofloEdge.from.node, outport: nofloEdge.from.port};
      }
    }
    return undefined;
  }

  _nofloGetInitialValue ({node, inport}) {
    for (let initializer of this.getNofloGraph().initializers) {
      if (initializer.to.node === node && initializer.to.port === inport) {
        return initializer.from.data;
      }
    }
    return undefined;
  }

  _nofloNode ({node}) {
    let nofloNode = this.getNofloGraph().getNode(node);
    if (!nofloNode) {
      throw new Error(`No node found with id "${node}"`);
    }

    return nofloNode;
  }

  metadata ({node, setup = false}) {
    let metadata = this._nofloNode({node}).metadata;

    if (setup) {
      if (metadata.cached === undefined) {
        metadata.cached = {
          inports: {},
          compiled: {},
          outports: {}
        };
      }

      if (metadata.attached === undefined) {
        metadata.attached = {};
      }

      for (let inport of this.inports({node})) {
        if (metadata.attached[inport] === undefined) {
          metadata.attached[inport] = {};
        }
      }

      for (let inport of this.inports({node})) {
        if (metadata.cached.inports[inport] === undefined) {
          metadata.cached.inports[inport] = {};
        }
      }
      for (let outport of this.outports({node})) {
        if (metadata.cached.compiled[outport] === undefined) {
          metadata.cached.compiled[outport] = {};
        }
      }
      for (let outport of this.outports({node})) {
        if (metadata.cached.outports[outport] === undefined) {
          metadata.cached.outports[outport] = {};
        }
      }
    }

    return metadata;
  }

  portStr ({node, inport = null, outport = null}) {
    if (inport !== null) {
      return `${inport}:${this.component({node})}/${node}`;
    }

    return `${this.component({node})}/${node}:${outport}`;
  }

  connectedInportUsage ({node, inport}) {
    let {outnode, outport} = this.getInportConnection({node, inport});
    let {usage} = this.getCachedOutport({node: outnode, outport});

    if (usage !== 'static' && usage !== 'dynamic') {
      throw new Error('No cached output usage!' +
                      ` Node ${this.portStr({node, inport})}` +
                      ` is connected to ${this.portStr({node, outport})}`);
    }

    return usage;
  }

  effectiveInportUsage ({node, inport}) {
    let componentInportInfo = this.componentInportInfo({node, inport});

    if (componentInportInfo.usage === 'static') {
      return 'static';
    } else if (componentInportInfo.usage === 'dynamic') {
      return 'dynamic';
    } else if (componentInportInfo.usage === undefined || componentInportInfo.usage === 'inherit') {
      if (this.hasAttached({node, inport})) {
        let {usage} = this.getAttached({node, inport});
        assert(usage === 'static' || usage === 'dynamic');
        return usage;
      }

      if (this.hasInportConnection({node, inport})) {
        let usage = this.connectedInportUsage({node, inport});
        assert(usage === 'static' || usage === 'dynamic');
        return usage;
      }

      // no value attached, so the value of none/undefined is static
      return 'static';
      // throw new Error(`Node "${node}" has no connection at inport "${inport}"`);
    }
    throw new Error(`Component "${this.component({node})}" has an invalid usage "${componentInportInfo.usage}"`);
  }

  effectiveOutportUsage ({node, outport}) {
    let componentOutportInfo = this.componentOutportInfo({node, outport});

    if (componentOutportInfo.usage === 'static') {
      return 'static';
    } else if (componentOutportInfo.usage === 'dynamic') {
      return 'dynamic';
    } else if (componentOutportInfo.usage === undefined || componentOutportInfo.usage === 'inherit') {
      let depends = this.depends({node, outport});

      if (depends.length === 0) {
        throw new Error(`Node "${outport}" has a defined usage of 'inherit', yet does not have any depends property`);
      }

      for (let inport of depends) {
        if (this.hasAttached({node, inport})) {
          let {usage} = this.getAttached({node, inport});
          if (usage === 'dynamic') {
            return 'dynamic';
          }
        }

        if (this.hasInportConnection({node, inport})) {
          let inportUsage = this.effectiveInportUsage({node, inport});
          assert(inportUsage === 'static' || inportUsage === 'dynamic');

          if (inportUsage === 'dynamic') {
            return 'dynamic';
          }
        }
      }

      return 'static';
    }
    throw new Error(`Component "${this.component({node})}" has an invalid usage "${componentOutportInfo.usage}"`);
  }

  componentHasInport ({component, inport}) {
    let componentInfo = this.componentInfo({component});

    for (let inportInfo of componentInfo.inports) {
      if (inportInfo.name === inport) {
        return true;
      }
    }

    return false;
  }

  hasInport ({node = null, component = null, inport}) {
    if (component === null) {
      component = this.component({node});
    }

    return this.componentHasInport({component, inport});
  }

  componentSanity ({component}) {
    let componentInfo = this.componentInfo({component});

    for (let componentOutportInfo of componentInfo.outports) {
      let outport = componentOutportInfo.name;

      let depends = componentOutportInfo.depends;
      if (componentOutportInfo.pass === true) {
        // make sure that if it passes, then it must have a corresponding inport of the same name.
        if (!this.hasInport({component, inport: outport})) {
          throw new Error(`Component "${component}" specifies outport "${outport}" to` +
                          ' {pass: true}, but does not have a corresponding inport');
        }

        if (componentOutportInfo.hasOwnProperty('depends')) {
          throw new Error(`Component "${component}" specifies outport "${outport}" to` +
                          ' {pass: true}, but also specifies a "depends" property');
        }

        if (componentOutportInfo.hasOwnProperty('usage')) {
          throw new Error(`Component "${component}" specifies outport "${outport}" to` +
                          ' {pass: true}, but also specifies a "usage" property');
        }

        for (let depend of depends) {
          // check for error
          this.componentInportInfo({component, inport: depend});
        }

        return;
      }

      if (depends === undefined) {
        depends = [];
      }

      if (depends.length === 0 && componentOutportInfo.usage === 'inherit') {
        throw new Error(`Component "${component}" has a usage of 'inherit', yet has no dependencies`);
      }

      for (let depend of depends) {
        if (!this.componentHasInport({component, inport: depend})) {
          throw new Error(`Component "${component}" has a dependency "${depend}" that is not an inport of this component`);
        }
      }

      // tl;dr if the outport is static, the dependencies better be static too.
      if (componentOutportInfo.usage === 'static') {
        for (let depend of depends) {
          let componentInportInfo = this.componentInportInfo({component, inport: depend});

          if (componentInportInfo.usage !== 'static') {
            throw new Error(`Component "${component}" has a usage of "${componentOutportInfo.usage}",` +
                            ' while it depends on an inport' +
                            ` "${depend}" that has a usage of "${componentInportInfo.usage}"`);
          }
        }
      }
    }
  }

  nodeSanity ({node}) {
    let component = this.component({node});
    this.componentSanity({component});
    this.componentInfo({node});
  }

  evaluateInportSource ({node, inport}) {
    if (this.hasInportConnection({node, inport})) {
      let {outnode, outport} = this.getInportConnection({node, inport});
      return `-${outnode}-${outport}-${node}-${inport}`;
    } else if (this.hasAttached({node, inport})) {
      return `attached-${node}-${inport}`;
    } else {
      return 'none';
      // throw new Error(`Cannot evaluate inport source for node "${node}" and inport "${inport}"; there is no attached value, and no inport connection`);
    }
  }

  getCachedOutport ({node, outport}) {
    let metadata = this.metadata({node, setup: true});

    let valueChanged = metadata.cached.outports[outport].valueChanged;
    let staticChanged = metadata.cached.outports[outport].staticChanged;
    let value = metadata.cached.outports[outport].value;
    let usage = metadata.cached.outports[outport].usage;
    let checked = metadata.cached.outports[outport].checked;

    if (staticChanged === undefined) {
      throw new OutportDoesNotContainData({node, outport});
    }

    return {value, usage, valueChanged, staticChanged, checked};
  }

  pullStatic ({node}) {
    let metadata = this.metadata({node, setup: true});

    for (let inport of this.inports({node})) {
      let usage = this.effectiveInportUsage({node, inport});
      let source = this.evaluateInportSource({node, inport});
      let staticChanged = metadata.cached.inports[inport].staticChanged;
      let checked = this.frame;
      let value;

      if (staticChanged === undefined) {
        staticChanged = -1;
      }

      if (this.hasInportConnection({node, inport})) {
        let {outnode, outport} = this.getInportConnection({node, inport});
        let newStaticChanged;
        let newValue;
        ({value: newValue, usage, staticChanged: newStaticChanged} = this.getCachedOutport({node: outnode, outport}));

        if (usage === 'static') {
          value = newValue;
        }
        staticChanged = Math.max(staticChanged, newStaticChanged);
      } else if (this.hasAttached({node, inport})) {
        let {value: newValue, usage: newUsage, staticChanged: newStaticChanged, valueChanged} = this.getAttached({node, inport});
        assert(usage === newUsage);
        if (usage === 'static') {
          value = newValue;
          staticChanged = Math.max(staticChanged, valueChanged);
        }
        staticChanged = Math.max(staticChanged, newStaticChanged);
      } else {
        // not attached or connected, has no value
        // source === 'none'
        // staticChanged will be the cached staticChanged, unless the source changed.
      }

      if (metadata.cached.inports[inport].usage !== usage) {
        staticChanged = this.frame;
      }

      if (metadata.cached.inports[inport].source !== source) {
        staticChanged = this.frame;
      }

      metadata.cached.inports[inport] = {usage, source, staticChanged, checked};

      if (usage === 'static') {
        metadata.cached.inports[inport].value = value;
      }
    }
  }

  pullDynamic ({node}) {
    let metadata = this.metadata({node, setup: true});

    for (let inport of this.inports({node})) {
      let usage = this.effectiveInportUsage({node, inport});

      if (usage !== 'dynamic') {
        continue;
      }

      // let source = this.evaluateInportSource({node, inport});
      let valueChanged = metadata.cached.inports[inport].valueChanged;
      let value;

      // TODO: can do a bunch of sanity testing here, make sure staticPull() happened,
      // make sure things match up

      if (valueChanged === undefined) {
        valueChanged = -1;
      }

      if (this.hasInportConnection({node, inport})) {
        let {outnode, outport} = this.getInportConnection({node, inport});
        let newValueChanged;
        let newValue;
        ({value: newValue, usage, valueChanged: newValueChanged} = this.getCachedOutport({node: outnode, outport}));

        value = newValue;
        valueChanged = Math.max(valueChanged, newValueChanged);
      } else if (this.hasAttached({node, inport})) {
        let {value: newValue, usage: newUsage, valueChanged: newValueChanged} = this.getAttached({node, inport});
        assert(usage === newUsage);
        value = newValue;
        valueChanged = Math.max(valueChanged, newValueChanged);
      } else {
        // not attached or connected, has no value
        // source === 'none'
        // staticChanged will be the cached staticChanged, unless the source changed.
      }

      metadata.cached.inports[inport].value = value;
      metadata.cached.inports[inport].valueChanged = valueChanged;
    }
  }

  getCachedInport ({node, inport}) {
    let metadata = this.metadata({node, setup: true});

    let source;
    let value;
    let usage;
    let staticChanged;
    let valueChanged;
    let checked;

    if (metadata.cached.inports[inport] === undefined) {
      throw new InportDoesNotContainCache({node, inport});
    }

    ({value, source, usage, staticChanged, valueChanged, checked} = metadata.cached.inports[inport]);
    return {value, source, usage, staticChanged, valueChanged, checked};
  }

  setCachedInport ({node, inport, value, usage, staticChanged, valueChanged, source}) {
    let metadata = this.metadata({node, setup: true});

    metadata.cached.inports[inport].value = value;
    metadata.cached.inports[inport].source = source;
    metadata.cached.inports[inport].usage = usage;
    metadata.cached.inports[inport].staticChanged = staticChanged;
    metadata.cached.inports[inport].valueChanged = valueChanged;
    metadata.cached.inports[inport].checked = this.frame;
  }

  initializeNode ({node}) {
    for (let inport of this.inports({node})) {
      this.resetInportInitial({node, inport});
    }
  }

  resetInportInitial ({node, inport}) {
    let componentInportInfo = this.componentInportInfo({node, inport});

    if (componentInportInfo.hasOwnProperty('initial')) {
      let value = clone(componentInportInfo.initial);
      let usage = 'static';
      this.setAttached({node, inport, value, usage});
    }
  }

  needsRecompilation ({node, outport}) {
    // if any of the depends had a change in staticness more recently than the compiled stuff, then compiled output is dirty
    // if any of the static depends had a change in connection more recently than the compiled stuff, then the compiled output is dirty
    // if any of the static depends has a value changed more recently than the compiled stuff, then the compiled output is dirty

    let metadata = this.metadata({node, setup: true});

    let compiledFrame = metadata.cached.compiled[outport].staticChanged;

    if (compiledFrame === undefined) {
      return true;
    }

    for (let inport of this.depends({node, outport})) {
      let {staticChanged} = this.getCachedInport({node, inport});

      if (staticChanged > compiledFrame) {
        return true;
      }
    }

    return false;
  }

  needsReexecution ({node, outport, runtime}) {
    // if any of the depends had a change in staticness more recently than the compiled stuff, then compiled output is dirty
    // if any of the static depends had a change in connection more recently than the compiled stuff, then the compiled output is dirty
    // if any of the static depends has a value changed more recently than the compiled stuff, then the compiled output is dirty

    if (runtime === 'dynamic') {
      return true;
    }
    let metadata = this.metadata({node, setup: true});

    let compiledFrame = metadata.cached.outports[outport].staticChanged;

    if (compiledFrame === undefined) {
      return true;
    }

    if (this.effectiveOutportUsage({node, outport}) !== metadata.cached.outports[outport].usage) {
      return true;
    }

    for (let inport of this.depends({node, outport})) {
      let {staticChanged} = this.getCachedInport({node, inport});

      if (staticChanged > compiledFrame) {
        return true;
      }
    }

    return false;
  }

  clearCache ({node}) {
    let metadata = this.metadata({node});

    if (metadata.hasOwnProperty('cached')) {
      delete metadata.cached;
    }
  }

  saveCompiled ({node, outport, compiled}) {
    let metadata = this.metadata({node, setup: true});

    metadata.cached.compiled[outport].value = compiled;
    metadata.cached.compiled[outport].staticChanged = this.frame;
    metadata.cached.compiled[outport].checked = this.frame;
  }

  staticSave ({node, outport, value}) {
    let metadata = this.metadata({node, setup: true});

    let usage = this.effectiveOutportUsage({node, outport});

    metadata.cached.outports[outport].value = value;
    metadata.cached.outports[outport].usage = usage;
    metadata.cached.outports[outport].valueChanged = this.frame;
    metadata.cached.outports[outport].staticChanged = this.frame;
    metadata.cached.outports[outport].checked = this.frame;
  }

  dynamicSave ({node, outport, value}) {
    let metadata = this.metadata({node, setup: true});

    // TODO: assert sanity

    metadata.cached.outports[outport].value = value;
    metadata.cached.outports[outport].valueChanged = this.frame;
    metadata.cached.outports[outport].checked = this.frame;
  }

  compile ({node, force = false}) {
    let dag = this;

    return Promise.resolve()
      .then(function () {
        let metadata = dag.metadata({node, setup: true});
        let promises = [];

        for (let outport of dag.outports({node})) {
          let componentInfo = dag.componentInfo({node, outport});

          if (componentInfo.compile === undefined) {
            throw new Error('Component is malformed: there is no `compile` dictionary');
          }

          if (force) {
            metadata.cached.compiled[outport].staticChanged = undefined;
            metadata.cached.compiled[outport].value = undefined;
          }

          if (!dag.needsRecompilation({node, outport})) {
            continue;
          }

          let compile = componentInfo.compile[outport];

          if (!compile) {
            continue;
          }

          let promise = Promise.resolve();

          // console.log(`outport ${outport} compile:`,compile);
          // console.log(`dag.needsRecompilation({"${node}", "${outport}"}):`, dag.needsRecompilation({node, outport}));
          if (dag.needsRecompilation({node, outport})) {
            // TODO: should we clear the compiled cache now?
            let context = new NodeExecutionContext({node, outport, dag, runtime: 'static'});
            promise = promise.then(function () {
              return Promise.resolve(compile({context}));
            })
                      .then(function (compiled) {
                        console.log('saving compiled: ', compiled);
                        dag.saveCompiled({node, outport, compiled});
                        return Promise.resolve();
                      });
          }
          promises.push(promise);
        }

        return Promise.all(promises);
      }); // return Promise.resolve().then( function() { ..
  }

  incFrame () {
    let frame = this.frame | 0;
    this.frame = (this.frame + 1) | 0;
    return frame;
  }

  incCounter () {
    let counter = this.counter | 0;
    this.counter = (this.counter + 1) | 0;
    return counter;
  }

  levelOrdering () {
    let V = this.getNofloGraph().nodes.map((nofloNode) => nofloNode.id);
    let E = this.getNofloGraph().edges.map((nofloEdge) => [nofloEdge.from.node, nofloEdge.to.node]);
    V = new Set(V);
    E = computeEdgesToMap({V, E});

    let levelOrder = computeLevelOrder({V, E});
    return levelOrder;
  }

  ordering () {
    let levelOrder = this.levelOrdering();

    let order = [];
    for (let level of levelOrder) {
      for (let node of level) {
        order.push(node);
      }
    }

    return order;
  }

  visitLevel ({level, visitor, parallel, failure = null}) {
    // turn this into a promise returning function
    return Promise.resolve()
      .then(function () {
        // turn the `visitor` callback into a promise returning function, if it doesn't return
        // a promise already.
        function visit (node) {
          return Promise.resolve()
                        .then(function () {
                          return Promise.resolve(visitor(node));
                        });
        }

        if (parallel) {
          let promises = level.map(function (node) {
            return visit(node);
          });

          // returns a list of promises that will return a result list in the form of
          // [ {result: ..}, {result: ..}, {error: ..}]
          // in other words, turns off the fail-fast behavior of Promise.all()
          promises.map((p) => p.then((r) => ({ result: r })).catch(e => ({error: e})));

          return Promise.all(promises)
            .then(function (results) {
              for (let index = 0; index < results.length; ++index) {
                let result = results[index];
                let node = level[index];
                if (result.error && failure) {
                  failure(result.error, node);
                }
              }

              // now throw the first
              for (let result of results) {
                if (result.error && failure) {
                  throw result.error;
                }
              }
            });
        } else {
          // for each node,
          //   I hate you JS
          //   this forces each node to complete before running the next one.
          //   an actual for-loop would start all the nodes being visited at once.
          return level.reduce(function (promise, node) {
            return promise.then(function () {
              return visit(node).catch(function (err) {
                if (failure) {
                  failure(err, node);
                }

                throw err;
              });
            });
          },
            Promise.resolve()
          );
        }
      }); // Promise.resolve().then(function() {
  }

  /**
   * Visits the graph in a valid order.
   *
   * Note that visitor might be called in parallel on independent nodes.
   * To prevent this, specifay `parallel: false`.
   */
  orderedVisit ({visitor, failure = null, parallel = true}) {
    let dag = this;

    let levelOrder = dag.levelOrdering();

      // for each level,
      //   I hate you JS
      //   this forces each level to complete before running the next one.
      //   an actual for-loop would start all the nodes compiling/executing at once.
    return levelOrder.reduce(function (promise, level) {
      return promise.then(function () {
        return dag.visitLevel({level, visitor, failure, parallel});
      });
    },
      Promise.resolve()
    );
  }

  compileFrame ({force, failure = null, parallel = true}) {
    let dag = this;

    return Promise.resolve()
      .then(function () {
        dag.incFrame();

        function visitor (node) {
          return Promise.resolve()
            .then(function () {
              dag.pullStatic({node});
              return dag.compile({node, force});
            })
            .then(function () {
              return dag.execute({node, runtime: 'static', force});
            });
        }

        return dag.orderedVisit({visitor, failure, parallel});
      });
  }

  executeFrame ({failure, parallel = true}) {
    let dag = this;

    return Promise.resolve()
      .then(function () {
        dag.incFrame();

        function visitor (node) {
          return Promise.resolve()
            .then(function () {
              dag.pullDynamic({node});
              return dag.execute({node, runtime: 'dynamic'});
            });
        }

        return dag.orderedVisit({visitor, failure, parallel});
      });
  }

  execute ({node, runtime, force = false}) {
    let dag = this;

    return Promise.resolve()
      .then(function () {
        let metadata = dag.metadata({node, setup: true});
        let promises = [];

        if (runtime !== 'static' && runtime !== 'dynamic') {
          throw new Error(`invalid runtime "${runtime}"`);
        }

        for (let outport of dag.outports({node})) {
          let componentInfo = dag.componentInfo({node});
          let componentOutportInfo = dag.componentOutportInfo({node, outport});

          let usage = dag.effectiveOutportUsage({node, outport});

          assert(usage === 'static' || usage === 'dynamic');

          console.log(`runtime: ${runtime}, usage: ${usage}`);

          if (force) {
            metadata.cached.outports[outport].staticChanged = undefined;
            metadata.cached.outports[outport].valueChanged = undefined;
            metadata.cached.outports[outport].value = undefined;
          }

          if (runtime === 'static' && !dag.needsReexecution({node, outport, runtime})) {
            // TODO: touch checked
            continue;
          }

          if (runtime === 'static' && usage === 'static') {
            // reset the outport, since it is gonna be replaced anyway
            dag.staticSave({node, outport, value: undefined});
          }

          if (runtime === 'static' && usage === 'dynamic') {
            // if it needs static reexecution,
            // it means something changed statically,
            // and we should reset it.
            if (dag.needsReexecution({node, outport, runtime})) {
              dag.staticSave({node, outport, value: undefined});
            }
          }

          if (runtime !== usage) {
            continue;
          }

          if (componentInfo.execute === undefined) {
            throw new Error('Component is malformed: there is no `execute` dictionary');
          }

          if (componentOutportInfo.pass) {
            let promise = Promise.resolve()
                          .then(function () {
                            let {value} = dag.getCachedInport({node, inport: outport});
                            return Promise.resolve({outport, result: value});
                          });
            promises.push(promise);
            continue;
          }

          let execute = componentInfo.execute[outport];

          if (execute === undefined) {
            throw new Error(`Component is malformed: there is no \`execute\` routine for the outport ${outport}`);
          }

          // metadata.cached.outports[outport].checked = frame;

          // if (!dag.needsRecompilation({node, outport})) {
          //   continue;
          // }

          let context = new NodeExecutionContext({node, outport, dag, runtime});

          promises.push(Promise.resolve(execute({context})).then((result) => Promise.resolve({outport, result})));
        }

        return Promise.all(promises)
                .then(function (results) {
                  for (let {outport, result} of results) {
                    if (runtime === 'static') {
                      dag.staticSave({node, outport, value: result});
                    } else {
                      dag.dynamicSave({node, outport, value: result});
                    }
                  }
                  return Promise.resolve();
                });
      }); // return Promise.resolve().then( function() { ..
  }
}

let pipeline = {
  components: {
    blur: {}
  },

  DAG: function ({regl, resl, getNofloGraph, pipeline}) { return new DAG({regl, resl, getNofloGraph, pipeline}); }
};

pipeline.components.texture = require('./components/texture.js')();
pipeline.components['brute-gaussian'] = require('./components/brute-gaussian.js')();
pipeline.components.framebuffer = require('./components/framebuffer.js')();
pipeline.components.canvas = require('./components/canvas.js')();

pipeline.components.window = {
  inports: [{name: 'inviewport'}, {name: 'inresolution'}, {name: 'in'}, {name: 'id'}],
  outports: []
};

pipeline.components.none = {
  inports: [{'name': '>in', 'type': 'all'}],
  outports: [{'name': 'out>', 'type': 'all'}]
};

module.exports = pipeline;
