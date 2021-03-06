with (Hasher('Application')) {

  initializer(function() {
    if (Badger.getAccessToken()) BadgerCache.load();
  
    // an API call was made that requires auth
    Badger.onRequireAuth(require_person);

    Badger.onLogin(function() {
      set_route('#', { reload_page: true });
    });

    Badger.onLogout(function() {
      set_route('#', { reload_page: true });
    });
  });
  
  define('require_person', function() {
    if (!Badger.getAccessToken()) {
      Badger.setCookie('badger_url_after_auth', get_route());
      set_route('#account/create', { replace: true });
    }
  });
  
  route('#', function() {
    if (Badger.getAccessToken()) {
      var next_url = Badger.getCookie('badger_url_after_auth');
      if (next_url) {
        Badger.setCookie('badger_url_after_auth', null);
      } else {
        next_url = '#domains';
      }
      set_route(next_url);
    } else {
      set_route('#welcome');
    }
  });
  
  /*
    Poll until response returns true.
    
    Options:
    @max_time:        Number of seconds after which to timeout.
                        if -1, then poll forever.
    @interval:        The amount of time to wait between requests
    @action:          The API request to be made every step.
                        if returns true, breaks poll, otherwise it will
                        continue until until the timeout.
                        NOTE: this function must take a callback as it's
                        last paremeter (TODO allow synchronous)
    @on_timeout:      The function to be called when timeout is reached.
                        data about the poll is passed as an argument.
    @on_finish:       The function to be called when the action is finished
                        data about the poll is passed as an argument.
    @on_route_change: The function to be called if the route is changed mid-poll
                        data about the poll is passed as an argument.
    
    For the @action object:
    @method     The curried Badger API method to use.
                  note: the method MUST accept a callback
                  as it's last (or only) argument, AND the
                  curried method must NOT have the callback.
    @on_ok      The callback for 'ok' and 'created' resonses to
                  @method. The API response, as well as data about
                  the poll are passed to this as arguments.
    @on_error   The callback for 'ok' and 'created' resonses to
                  @method. The API response, as well as data about
                  the poll are passed to this as arguments.
    
    The poll is broken based on the return value of the on_ok and
    on_error callbacks.
    - If true is returned, then the poll is broken,
      and the on_finish callback is executed.
    - If nothing is returned
      (undefined), then the poll is broken and the on_finish callback
      is not called. If polling forever, then don't break.
    - If false is returned, then the poll marches onward.
      if polling forever.
    
    The on_ok and on_error callbacks must return false if you
    don't want to break out of the poll. If they return true,
    or nothing at all, then when they are executed the poll will
    stop.
  */
  define('long_poll', function(options) {
    // default options
    options = {
      max_time: options.max_time || 30000,
      interval: options.interval || 5000,
      on_timeout: options.on_timeout || (function() {}),
      on_finish: options.on_finish || (function() {}),
      on_route_change: options.on_route_change || (function() {}),
      
      // used in process_action_and_set_timeout
      action: options.action || {
        method: options.action.method || (function() {}),
        on_ok: options.action.on_ok || (function() {}),
        on_error: options.action.on_error || (function() {})
      },
      
      // data from the last iteration, or initilizer
      _poll_obj: options._poll_obj || {
        start_time: new Date(),
        max_time: options.max_time,
        previous_route: get_route()
      }
    };
    
    var poll_forever = options.max_time == -1;
        
    // if timed out, run break callback.
    if (!poll_forever && (new Date().getTime() - options._poll_obj.start_time.getTime()) >= options.max_time) {
      options.on_timeout({
        start_time: options._poll_obj.start_time,
        max_time: options._poll_obj.max_time,
        timed_out: true
      });
    // if route changed, kill of the poll
    } else if (get_route() != options._poll_obj.previous_route) {
      options.on_route_change({
        start_time: options._poll_obj.start_time,
        max_time: options._poll_obj.max_time,
        route_changed: true
      });
    } else {
      // track the time at which this iteration started
      var start_time = new Date().getTime();
      
      // save the route before running the action, because the action
      // may or may not change the route.
      var current_route = get_route();

      process_action_and_set_timeout(options);
    }
  });
  
  /*
    Helper method for poll. Reads the JSON object for the action,
    and calls it.
    
    @options same as from poll function
  */
  define('process_action_and_set_timeout', function(options) {
    var poll_forever = options.max_time == -1;
    var action_options = options.action;
    
    // calls the Badger API method
    action_options.method(function(response) {
      if (['ok', 'created'].includes(response.meta.status)) {
        // execute callback. break from poll defaults to true
        var break_from_poll = action_options.on_ok(response, {
          start_time: options._poll_obj.start_time,
          max_time: options._poll_obj.max_time
        });
      } else {
        // error. break from poll defaults to true
        var break_from_poll = options.on_error(response, {
          start_time: options._poll_obj.start_time,
          max_time: options._poll_obj.max_time
        });
      }
      
      if (break_from_poll == true) {
        // break out of the poll, call the on_finish_callback
        options.on_finish(response, {
          start_time: options._poll_obj.start_time,
          max_time: options._poll_obj.max_time
        });
      } else if (break_from_poll == false) {
        setTimeout(curry(long_poll, options), options.interval);
      } else if (break_from_poll == undefined) {
        if (poll_forever) return setTimeout(curry(long_poll, options), options.interval);
      }
    })
  });
  
  define('h1', function() {
    var h1 = element('h1', arguments);
    var title = h1.innerText || h1.textContent;
    if (!title.match(/badger/i)) title += " (Badger)";
    document.title = title;
    return h1;
  }); 
}

String.prototype.capitalize_all = function() {
	var words = [];
	this.split(' ').forEach(function(word) {
		words.push( word.charAt(0).toUpperCase() + word.slice(1) );
	});
	return words.join(" ");
}

String.prototype.capitalize_first = function() {
	return this.charAt(0).toUpperCase() + this.slice(1);
}

/**
Sick of using Array#indexOf of everywhere?
returns null if no arguments provided.
returns true if all arguments are included in the array.
returns false if any of the arguments are not in the array.
*/
Array.prototype.includes = function() {
  if (arguments.length < 1) return null;
  for (var i = 0; i < arguments.length; i++) { if (this.indexOf(arguments[i]) < 0) return false; }
  return true;
};

// == doesn't work for arrays, needed a way to check equality
Array.prototype.equal_to = function(array) {
  return array && JSON.stringify(this) == JSON.stringify(array);
};

// remove null and undefined values from array
Array.prototype.compact = function() {
  return this.filter(function(e) { return e != undefined; });
};

// The sorting algorithm in Chrome is not stable.
// Define a sorting method to guarantee stable sorts
// in all browsers.
// NOTE: unlike the vanilla JavaScript Array#sort,
// this method does not change the underlying object.
Array.prototype.stable_sort = function(compare) {
  var array2 = this.map(function(v, i) { return { i: i, v: v } });
  array2.sort(function(a, b) {
    if (compare) {
      var r = compare(a.v, b.v);
      return r == 0 ? a.i - b.i : r;
    } else {
      if (a.v < b.v) return -1;
      if (a.v > b.v) return 1;
      if (a.v == b.v) return 0;
      
      return r == 0 ? a.i - b.i : r;
    }
  });
  return array2.map(function(v) { return v.v });
};
