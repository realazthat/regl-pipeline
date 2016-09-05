
const μs = require('microseconds');

function approxRollingAverage (avg, newSample, N) {
  // from http://stackoverflow.com/a/16757630/586784
  avg -= avg / N;
  avg += newSample / N;

  return avg;
}


class GenericTimer {
  constructor({rollingSamples, timer}) {
    this.timer = timer;
    this.rollingSamples = rollingSamples;
    this.tickStartTime = this.timer();
    this.tickEndTime = this.timer();

    this.startTime = this.timer();
    this.endTime = this.timer();
    this.tickInTime = 0;
    this.tickToTickDelta = 0;


    this.ticks = 0|0;
    this.rollingTickInTime = 0;
    this.rollingTickSkipTime = 0;
    this.rollingTickTotalTime = 0;
  }

  tick () {
    let tickStartTime = this.timer();
    let tickSkipTime = this.tickEndTime - this.tickStartTime;

    this.ticks = ((this.ticks|0) + (1|0))|0;
    this.rollingTickSkipTime = approxRollingAverage(this.rollingTickSkipTime, tickSkipTime, this.rollingSamples);
    this.tickStartTime = tickStartTime;
    this.tickInTime = 0;
    this.startTime = tickStartTime;
    this.endTime = tickStartTime;


    return this;
  }

  start(){
    let startTime = this.timer();
    this.startTime = startTime;


    return this;
  }

  end(){
    let endTime = this.timer();
    let inTime = endTime - this.startTime;

    this.tickInTime += inTime;


    this.endTime = endTime;

    return this;
  }

  tock () {
    let tickEndTime = this.timer();

    this.tickToTickDelta = tickEndTime - this.tickEndTime;
    this.tickTotalTime = tickEndTime = this.tickEndTime;
    this.rollingTickInTime = approxRollingAverage(this.rollingTickInTime, this.tickInTime, this.rollingSamples);
    this.rollingTTTD = approxRollingAverage(this.rollingTTTD, this.tickToTickDelta, this.rollingSamples);
    this.rollingTickTotalTime = approxRollingAverage(this.rollingTickTotalTime, this.tickTotalTime, this.rollingSamples);

    this.tickEndTime = tickEndTime;

    return this;
  }
}

class MSTimer extends GenericTimer {
  constructor({rollingSamples}) {
    super({rollingSamples, timer: () => μs.now()/1000000});
  }
}

/*
 * Note that this requires reglCmd to have been created like so:
 *
 * ```regl({profile: true, ... other params})```
 */
class ReglCpuTimer extends GenericTimer{
  constructor({rollingSamples, reglCmd}) {
    super({rollingSamples, timer: () => reglCmd.stats.cpuTime});
  }
}

/**
 * Note that this requires regl to turn on the `EXT_disjoint_timer_query` extension.
 *
 * Note that this requires reglCmd to have been created like so:
 *
 * ```regl({profile: true, ... other params})```
 *
 * If not using this within a `regl.frame()`, you must call regl.poll()
 * and wait until the next Event Loop tick to get accurate results (for example,
 * using `setTimeout()`). As a result, this class is likely broken.
 */
class ReglGpuTimer extends GenericTimer{
  constructor({rollingSamples, reglCmd}) {
    super({rollingSamples, timer: () => reglCmd.stats.gpuTime});
  }
}

module.exports = {
  GenericTimer, MSTimer, ReglCpuTimer
}
