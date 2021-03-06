var Landing = require('./lib/landing'),
    Login = require('./lib/facebook_login'),
    SeleniumServer = require('selenium-webdriver/remote').SeleniumServer,
    Q = require('q'),
    debug = require('debug')('envoy:bootstrap_test'),
    execf = require('../../tasks/lib/execf'),
    http = require('http'),
    rimraf = require('rimraf').sync,
    spawn = require('child_process').spawn,
    webdriver = require('selenium-webdriver');

var ROOT_PATH = __dirname + '/../..';

var SELENIUM_JAR_PATH =
  ROOT_PATH + '/node_modules/selenium-standalone/.selenium/2.40.0/server.jar';

var METEOR_PATH = ROOT_PATH + '/buildtest';

var MONGO_PATH = ROOT_PATH + '/buildtest/.meteor/local/db/';

var meteor, selenium, driver;

before(function(done) {
  debug('Start selenium standalone server.');
  selenium = new SeleniumServer(SELENIUM_JAR_PATH, { port: 4444 });
  selenium.start();

  debug('Purge mongo database.');
  rimraf(MONGO_PATH);

  debug('Start meteor.');
  meteor = spawn('meteor', ['--port', '4000'], { cwd: METEOR_PATH });

  var stdout = [];
  meteor.stdout.on('data', function(chunk) {
    debug('meteor: %s', chunk.toString());

    // Write to buffer.
    stdout.push(chunk);
    var data = Buffer.concat(stdout).toString();

    // If meteor has written this message to stdout, we're good.
    if (data.indexOf('=> Started your app') === -1) {
      return;
    }

    debug('Meteor ready.');
    meteor.stdout.removeAllListeners('data');

    // TODO(gareth): We configure Facebook login here since I'm not sure how
    //     to purge the configuration after each test since it's hidden
    //     behind the accounts-facebook package abstraction. We should
    //     look into whether there's a stable way to reset state though.
    debug('Configure FB login.');
    driver = client();
    global.driver = driver;

    var timeouts = new webdriver.WebDriver.Timeouts(driver);
    timeouts
      .setScriptTimeout(20000)
      .then(function() {
        var landing = new Landing();
        return landing.launch();
      })
      .then(function() {
        var login = new Login();
        return login.configure();
      })
      .then(function() {
        return driver.quit();
      })
      .then(function() {
        done();
      });
  });

  // TODO(gareth): For some reason our test suite
  //     times out on circleci if we don't listen to
  //     stderr. Why is that?
  meteor.stderr.on('data', function() {
  });
});

after(function(done) {
  debug('Stop selenium standalone server.');
  selenium.stop();

  debug('Stop meteor server.');
  meteor.on('exit', function() {
    done();
  });
  meteor.kill();
});

beforeEach(function() {
  debug('Load fixtures.');
  execf('cd %s && ./node_modules/.bin/grunt fixtures:test', ROOT_PATH);

  driver = client();
  global.driver = driver;

  var timeouts = new webdriver.WebDriver.Timeouts(driver);
  return timeouts.setScriptTimeout(20000);
});

afterEach(function() {
  return driver
    .quit()
    .then(function() {
      // Start another driver to clear the database.
      global.driver = driver = client();
      var timeouts = new webdriver.WebDriver.Timeouts(driver);
      return timeouts.setScriptTimeout(20000);
    })
    .then(function() {
      var landing = new Landing();
      return landing.launch();
    })
    .then(function() {
      debug('Reset collections.');
      return driver.executeAsyncScript(function() {
        var callback = arguments[arguments.length - 1];
        Meteor.call('removeAll', function() {
          callback();
        });
      });
    })
    .then(function() {
      return driver.quit();
    });
});

function client() {
  debug('Begin selenium session.');
  var result = new webdriver
    .Builder()
    .usingServer(selenium.address())
    .withCapabilities(webdriver.Capabilities.firefox())
    .build();

  // Decorate driver.quit() with calls to grab the
  // coverage object from the browser and post it.
  var quit = result.quit.bind(result);
  result.quit = function() {
    debug('Grab coverage data from browser.');
    return this
      .executeScript(function() {
        return window.__coverage__;
      })
      .then(function(data) {
        return postCoverageData(data);
      })
      .then(function() {
        return quit();
      });
  };

  return result;
}
global.client = client;

function switchToClient(value) {
  // TODO(areth): Create another way to tell the views which driver
  //     to use. Overriding the global driver not so good.
  global.driver = value;
}
global.switchToClient = switchToClient;

function postCoverageData(data) {
  debug('Post coverage data to istanbul server.');
  var deferred = Q.defer();
  var options = {
    host: 'localhost',
    port: 8080,
    path: '/coverage/client',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  var req = http.request(options);
  req.once('response', function(message) {
    message.on('data', function() {});
    message.once('end', function() {
      debug('Coverage data posted (%d).', message.statusCode);
      deferred.resolve();
    });
  });
  req.once('error', function(error) {
    deferred.reject(error);
  });

  req.write(JSON.stringify(data));
  req.end();

  return deferred.promise;
}
