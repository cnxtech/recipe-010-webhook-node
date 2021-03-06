// 010.webhook.js
// JavaScript helper for the 010.webhook recipe
// This is NOT the Node.js recipe!
;(function ($) {
  
  	// parameters are set via ds_params.
	// Eg {'navbar' : 'li_home'}
	// 
	// Private global variabls for the functions
	var toc_items = [], // array of the items that are being displayed
		// The array is in normal sort order -- latest item is at the end
		envelope_terminal_statuses = ["Completed", "Declined", "Voided", 
			"AuthoritativeCopy", "TransferCompleted", "Template"],
	 	countdown_interval_id = false,
		countdown_i = 100,
		ace_editor = false; 
	
	function set_nav_bar () {
		// Uses the navbar element of ds_params
		if (ds_params !== undefined && ds_params !== null 
			&& typeof ds_params === 'object' && ds_params.navbar !== undefined ) {
			
			$('#' + ds_params.navbar).addClass("active");
		}
	}
	
	function set_on_send_btn() {
		// params:
		// 'send_param' => ["ds_signer1_name"  => $connect_lib->ds_signer1_name,
		// 				 "ds_signer1_email" => $connect_lib->ds_signer1_email,
		// 				 "button" => "sendbtn",
		// 				 "url" => "010.connect.php?op=send2",
		// 				 "target" => "target"]

		if (ds_params == undefined || ds_params == null 
			|| typeof ds_params !== 'object' || ds_params.send_param === undefined ) {
				return; // EARLY return, nothing to do here!
		}
		
		// All's good
		var send_param = ds_params.send_param,
			button = "#" + send_param.button,
			url = send_param.url,
			target = "#" + send_param.target;
		
		$(button).click(function() {
			button_disable(button);
			$(target).html("<p>Working...</p>");
			$.ajax({
				url: url,
           		type: 'post',
            	data: JSON.stringify(send_param),
            	contentType: "application/json; charset=utf-8",
				dataType: "json"
			})
			.done(function(data, textStatus, jqXHR) {
				button_enable(button);
			    $(target).html(data.html);
				js_requests(data); // nb. may disable the button
			})
			.fail(function(jqXHR, textStatus, errorThrown) {
				button_enable(button);
			    $(target).html("<h3>Problem</h3><p>" + textStatus + ": " + errorThrown + "</p>");
			})
		});
	}
		
	function js_requests(data) {
		// Look for a js field. If it exists, handle...
		// So far, just handling
		//   'js' => ['disable_button' => 'sendbtn']];
		if (data.hasOwnProperty('js')) {
			data.js.forEach(js_request);
		}
	}
	
	function js_request(element, index, array) {
		// So far, just handling
		//   'js' => ['disable_button' => 'sendbtn']];
		if (element.hasOwnProperty('disable_button')) {
			button_disable("#" + element.disable_button);
		}
	}
	
	function button_disable(id) {
		$(id).attr("disabled", "disabled");
	}
	
	function button_enable(id) {
		$(id).removeAttr("disabled");			
	}
	
	//////////////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////////////
	//
	// Functions for showing the incoming events
	// Add envelope info to #env_info
	// The left column ul is #toc, the main column uses xml_info for info and feedback
	
	function show_status() {
		if (ds_params === undefined || ds_params === null 
			|| typeof ds_params !== 'object' 
			|| ds_params.status_envelope_id === undefined
			|| !ds_params.status_envelope_id) {
				return;
		}
		
		// We're good to go!
		var envelope_id = ds_params.status_envelope_id,
			interval_id;
		
		// Keep the humans occupied..
		countdown_interval_id = setInterval(countdown, 300);
		
		var fetch_latest = function (){
			// This function fetches the latest info from the server
			working_show();
			$.ajax({
				url: ds_params.url + "?op=status_items",
           		type: 'post',
            	data: JSON.stringify({'envelope_id':envelope_id}),
            	contentType: "application/json; charset=utf-8",
				dataType: "json"
			})
		  .fail(function(jqXHR, textStatus, errorThrown) {
		    console.log("Problem: Couldn’t fetch the xml file" + textStatus + ": " + errorThrown);
		  })
			.done(function(data, textStatus, jqXHR) {
				var stop_fetching = process_items(data);
				if (stop_fetching) {
					clearInterval(interval_id);
				}
			})
			.always(function() {working_hide();})
		}
		
		// The main stem...
		window_resized();
		$(window).resize(window_resized);
		working_show();
		get_envelope_info(envelope_id);
		interval_id = setInterval(fetch_latest, 3000);
	}
	
	function get_envelope_info(envelope_id){
		// Fetch some basic envelope information for the page
		$.ajax({
			url: ds_params.url + "?op=status_info",
       		type: 'post',
        	data: JSON.stringify({'envelope_id':envelope_id}),
        	contentType: "application/json; charset=utf-8",
			dataType: "json"
		})
		.done(function(data, textStatus, jqXHR) {
			$('#env_info').html("<h4>Subject: " + data.emailSubject 
			+ "</h4><p>Envelope ID: " + data.envelopeId + "</p>");
			window_resized();
		})
	}
	
	function process_items(data){
		// Process the list of items
		// The data is an array of events. Events are objects
		// [event]
		// event :: 
		// { envelope_id,
		//	 time_generated,
		//   subject
		//	 sender_user_name
		//	 sender_email
		//	 envelope_status
		//	 timezone_offset
		//   recipients: [recipient]
		//   documents: [document]	
		// }	
		//
		// recipient ::
		// { type
		//	 email
		//	 user_name
		//	 routing_order
		//	 sent_timestamp
		//	 status
		// }
		//
		// document ::
		// { document_ID
		//   document_type
		//   name
		//   url 
		// }
		// RETURNS stop_fetch -- should we stop querying?
		
		if (data.length == 0) {return;} // nothing to do...
		stop_countdown();
		
		// Sort the incoming events
		data.sort(function (a, b) {
  			// compare time_generated eg 2016-01-01T01:07:04.1479113
			var a_parts = a.time_generated.split('.'),
				b_parts = b.time_generated.split('.'),
				a_datetime = new Date(a_parts[0]),
				b_datetime = new Date(b_parts[0]);
			if (a_datetime > b_datetime) {return 1;}
			if (a_datetime < a_datetime) {return -1;}
			if (a_parts[1] > b_parts[1]) {return 1;}
			if (a_parts[1] < b_parts[1]) {return -1;}
			return 0; // a must be equal to b
	  	});
	
		// remove incoming items that we aleady know about
		var data_new  = data.filter (function (val, index, arr){
			return !toc_items.find(function (element, i, a){
				return val.time_generated == element.time_generated;
			});
		});
		
		if (data_new.length == 0) {return;} // nothing to do...
	
		// display the new data
		data_new.forEach (function(val, index, arr){add_to_toc(val);});
		var latest = data_new[data_new.length - 1];
		
		return envelope_terminal_statuses.includes(latest.envelope_status); // envelope done?
	}
	
	function add_to_toc(item){
		// Augment the incoming data by comparing it with the prior data
		var toc_items_latest = toc_items.length > 0 ? toc_items[toc_items.length - 1] : false,
			status_class_new_data = "newdata",
			status_class_same_data = "";
    	
		// add envelope_status_class
		if (toc_items_latest) {
			item.envelope_status_class = (item.envelope_status == toc_items_latest.envelope_status) ? 
				status_class_same_data : status_class_new_data;
		} else {
			item.envelope_status_class = status_class_new_data;
		}
    	
		// add status_class for each recipient
		item.recipients.forEach (function(val, index, arr){
			if (toc_items_latest) {
				previous = toc_items_latest.recipients.find(function (element, i, a){
					return val.email == element.email &&
						val.user_name == element.user_name && // the same email can be two different user_names eg: a couple
						val.type == element.type && // Eg a person can be both a signer and later receive a specific cc or cd
						val.routing_order == element.routing_order ; // Eg, a person could sign twice, once after someone else
				});
				
				if (previous) {
					val.status_class = (val.status == previous.status) ? 
						status_class_same_data : status_class_new_data;
				} else {
					val.status_class = status_class_new_data;
				} 
			} else {
				val.status_class = status_class_new_data;
			}
		});
	
		toc_items.push(item); // We're assuming that we won't receive an item out of order.
		// Create the new li by using mustache with the template
	    var rendered = Mustache.render($('#toc_item_template').html(), item);
		prependListItem("toc", rendered);
		// The new item is now the first item in the toc ul.
		$("#toc").children().first().click(item, show_xml);
	}
	
	// prependListItem("test", "<li>The new item</li>");
	function prependListItem(listName, listItemHTML){
		// See http://stackoverflow.com/a/1851486/64904
	    $(listItemHTML)
	        .hide()
	        .css('opacity',0.0)
	        .prependTo('#' + listName)
	        .slideDown('slow')
			.animate({opacity: 1.0});
		window_resized();
	}

	var show_xml = function(event) {
		// This is a jQuery event handler. See http://api.jquery.com/Types/#Event
		// It fills in the main column
		var item = event.data, // our object about the xml notification
			item_info_el = $("#xml_info");
	
		$(item_info_el).html("<h2>Working...</h2>");
		$.ajax({
			url: item.xml_url,
       		type: 'get',
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
		    $(item_info_el).html("<h3>Problem: Couldn’t fetch the xml file</h3><p>" + textStatus + ": " + errorThrown + "</p>");
		})
		.done(function(data, textStatus, jqXHR) {	
			var xml_pretty = xml_make_pretty(jqXHR.responseText),
				rendered = Mustache.render($('#xml_file_template').html(), item);
			$(item_info_el).html(rendered);
			if (! ace_editor) {
				ace_editor = ace.edit("editor");
				ace_editor.setReadOnly(true);
    			ace_editor.setTheme("ace/theme/chrome");
			    ace_editor.setOption("wrap", "free");
				ace_editor.$blockScrolling = Infinity;
				window_resized();
			    var XMLMode = ace.require("ace/mode/xml").Mode,
				    ace_session = ace_editor.getSession();
				ace_session.setMode(new XMLMode());
				ace_session.setUseWrapMode(true);
				ace_session.setFoldStyle("markbeginend");
			}
			ace_editor.setValue(xml_pretty);
			ace_editor.getSelection().clearSelection();
			ace_editor.getSelection().moveCursorToScreen(0,0,true);
		})
	}

	var window_resized = function(){
		// resize left column
		var available = window.scrollHeight ? window.scrollHeight : $(window).height(),
			h = available -  $("#status_left").position().top; 
			// At least for Chrome, scrollHeight is only defined if there is a scrollbar
		
		if ($(window).width() > 991) { $("#status_left").height(h); }
		
		// resize editor div, 300 min
		var min = 300;
		if (ace_editor) {			
			h = $(window).height() - $("#editor").offset().top - $(".navbar").height() - 5;
			// The navbar is fixed so offset doesn't include it. (?)

			$("#editor").height((h < min) ? min : h);
			ace_editor.resize();
		}
	}

	var countdown = function(){
		// Update the countdown value
		countdown_i -= 1;
		$("#counter").text(countdown_i);
	}
	
	function stop_countdown(){
		if (! countdown_interval_id) {return;}
		clearInterval(countdown_interval_id);
		countdown_interval_id = false;
		$("#countdown").hide();
		$("#xml_info").html("<h1 class='toc-instructions'>← Click an item to see the XML file</h1>");
	}
	
	function working_show(){
		$("#working").removeClass("workinghide").addClass("workingshow");
	}
	
	function working_hide(){
		$("#working").removeClass("workingshow").addClass("workinghide");
	}
	
	//////////////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////////////
	
	function xml_make_pretty (xml) {
		// From https://gist.github.com/sente/1083506
		var formatted = '',
		    reg = /(>)(<)(\/*)/g,
			pad = 0,
			pad_content = "    ";
			
		xml = xml.replace(reg, '$1\r\n$2$3');

		jQuery.each(xml.split('\r\n'), function(index, node) {
		    var indent = 0;
		    if (node.match( /.+<\/\w[^>]*>$/ )) {
		        indent = 0;
		    } else if (node.match( /^<\/\w/ )) {
		        if (pad != 0) {
		            pad -= 1;
		        }
		    } else if (node.match( /^<\w[^>]*[^\/]>.*$/ )) {
		        indent = 1;
		    } else {
		        indent = 0;
		    }

		    var padding = '';
		    for (var i = 0; i < pad; i++) {
		        padding += pad_content;
		    }

		    formatted += padding + node + '\r\n';
		    pad += indent;
		});

		return formatted;
	}
	
	
	//////////////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////////////
	  
	// the mainline
	$(document).ready(function() {
		set_nav_bar();
		set_on_send_btn();
		// show_xml({data: {xml_url: "foo.xml"}}); // For testing: loads local foo.xml
		show_status();
	});
	
	
	
}(jQuery));

	//////////////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////////////

// Array.foreach polyfill
// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach
Array.prototype.forEach||(Array.prototype.forEach=function(r,t){var o,n;if(null==this)throw new TypeError(" this is null or not defined");var e=Object(this),i=e.length>>>0;if("function"!=typeof r)throw new TypeError(r+" is not a function");for(arguments.length>1&&(o=t),n=0;i>n;){var a;n in e&&(a=e[n],r.call(o,a,n,e)),n++}});
// Array.find polyfill
Array.prototype.find||(Array.prototype.find=function(r){if(null===this)throw new TypeError("Array.prototype.find called on null or undefined");if("function"!=typeof r)throw new TypeError("predicate must be a function");for(var t,n=Object(this),e=n.length>>>0,o=arguments[1],i=0;e>i;i++)if(t=n[i],r.call(o,t,i,n))return t});
// Array.includes polyfill
Array.prototype.includes||(Array.prototype.includes=function(r){"use strict";var t=Object(this),e=parseInt(t.length)||0;if(0===e)return!1;var n,a=parseInt(arguments[1])||0;a>=0?n=a:(n=e+a,0>n&&(n=0));for(var s;e>n;){if(s=t[n],r===s||r!==r&&s!==s)return!0;n++}return!1});


