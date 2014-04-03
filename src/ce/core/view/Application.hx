/**
 * Cloud Explorer, lightweight frontend component for file browsing with cloud storage services.
 * @see https://github.com/silexlabs/cloud-explorer
 *
 * Cloud Explorer works as a frontend interface for the unifile node.js module:
 * @see https://github.com/silexlabs/unifile
 *
 * @author Thomas Fétiveau, http://www.tokom.fr  &  Alexandre Hoyau, http://lexoyo.me
 * Copyrights SilexLabs 2013 - http://www.silexlabs.org/ -
 * License MIT
 */
package ce.core.view;

import js.Browser;
import js.html.Element;

using ce.util.HtmlTools;

class Application {

	static inline var ID_APPLICATION : String = "cloud-explorer";

	static inline var CLASS_LOADING : String = "loading";
	static inline var CLASS_STARTING : String = "starting";
	static inline var CLASS_BROWSING : String = "browsing";
	static inline var CLASS_AUTHORIZING : String = "authorizing";

	static inline var SELECTOR_LOGOUT_BTN : String = ".logoutBtn";
	static inline var SELECTOR_CLOSE_BTN : String = ".closeBtn";
	static inline var SELECTOR_HOME : String = ".home";
	static inline var SELECTOR_FILE_BROWSER : String = ".fileBrowser";
	static inline var SELECTOR_AUTH_POPUP : String = ".authPopup";

	public function new(iframe : js.html.IFrameElement) {

		this.iframe = iframe;

		initFrame();
	}

	var iframe : js.html.IFrameElement;

	var rootElt : Element;

	var logoutBtn : Element;
	var closeBtn : Element;


	public var home (default, null) : Home;

	public var fileBrowser (default, null) : FileBrowser;

	public var authPopup (default, null) : AuthPopup;


	///
	// CALLBACKS
	//

	public dynamic function onViewReady() : Void { }

	public dynamic function onLogoutClicked() : Void { }

	public dynamic function onCloseClicked() : Void { }

	public dynamic function onServiceClicked(name : String) : Void { }

	public dynamic function onAuthorizationWindowBlocked() : Void { }

	public dynamic function onServiceAuthorizationDone() : Void { }


	///
	// API
	//

	public function setDisplayed(v : Bool) : Void {

		iframe.style.display = v ? "block" : "none";
	}

	public function setLoaderDisplayed(v : Bool) : Void {

		rootElt.toggleClass(CLASS_LOADING , v);
	}

	public function setHomeDisplayed(v : Bool) : Void {

		if (v) {

			cleanPreviousState();
		}

		rootElt.toggleClass(CLASS_STARTING , v);
	}

	public function setFileBrowserDisplayed(v : Bool) : Void {

		if (v) {

			cleanPreviousState();
		}

		rootElt.toggleClass(CLASS_BROWSING , v);
	}

	public function setAuthPopupDisplayed(v : Bool) : Void {

		rootElt.toggleClass(CLASS_AUTHORIZING , v);
	}

	public function openAuthorizationWindow(url : String) : Void {

		// note: we might need to improve this method in order to have different possible sizes by cloud service
		var authPopup = Browser.window.open(url, "authPopup", "height=829,width=1035");

		if (authPopup == null || authPopup.closed || authPopup.closed == null) {
			
			onAuthorizationWindowBlocked();
		
		} else {

			if (authPopup.focus != null) { authPopup.focus(); }

			var timer = new haxe.Timer(500);
			
			timer.run = function() {

					if (authPopup.closed) {

						timer.stop();

						onServiceAuthorizationDone();
					}
				}
		}
	}


	///
	// INTERNALS
	//

	function currentState() : Null<String> {

		for (c in rootElt.className.split(" ")) {

			if( Lambda.has([CLASS_STARTING, CLASS_BROWSING], c) ) {

				return c;
			}
		}
		// if we're here, we have a problem (no current state ?!)
		return null;
	}

	private function cleanPreviousState() : Void {

		var cs : Null<String> = currentState(); trace("cs= "+cs);

		rootElt.toggleClass(CLASS_AUTHORIZING, false);
		
		if (cs != null) {

			rootElt.toggleClass(cs, false);
		}
	}

	private function initFrame() : Void {

		// init iframe
		iframe.style.display = "none"; trace("initFrame");
		iframe.style.position = "absolute";
		iframe.style.top = iframe.style.left = iframe.style.bottom = iframe.style.right = "0";

		iframe.onload = function(?_){ initElts(); }

		iframe.src = "cloud-explorer.html";
	}

	private function initElts() : Void {

		// select elements
		rootElt = iframe.contentDocument.getElementById(ID_APPLICATION);

		logoutBtn = rootElt.querySelector(SELECTOR_LOGOUT_BTN);
		logoutBtn.addEventListener( "click", function(?_){ onLogoutClicked(); } );

		closeBtn = rootElt.querySelector(SELECTOR_CLOSE_BTN);
		closeBtn.addEventListener( "click", function(?_){ onCloseClicked(); } );

		home = new Home(rootElt.querySelector(SELECTOR_HOME));
		home.onServiceClicked = onServiceClicked;

		fileBrowser = new FileBrowser(rootElt.querySelector(SELECTOR_FILE_BROWSER));

		authPopup = new AuthPopup(rootElt.querySelector(SELECTOR_AUTH_POPUP));

		onViewReady();
	}
}