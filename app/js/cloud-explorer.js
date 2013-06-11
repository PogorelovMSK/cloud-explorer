'use strict';

/**
 * Front-end component for the unifile node.js server
 * @see https://github.com/silexlabs/unifile
 * @author Thomas Fétiveau, http://www.tokom.fr/  &  Alexandre Hoyau, http://www.intermedia-paris.fr/
 * Copyrights SilexLabs 2013 - http://www.silexlabs.org/ -
 * License MIT
 */

/**
 * TODO
 * each time we have a new input text (rename or mkdir), set focus on input text
 * refresh after upload ! (or update model)
 * refresh after moove ! (or update model)
 * fix # anchor part in url should not appear (since angular 1.1.4)
 * create alert/error system with focus on inputs for faulty uses (like: rename file to a invalid name, ...)
 * console messages + display
 * bootstrap styling
 * move between services [need fix in unifile]
 * drag from CE to desktop
 * upload progress
 * selectable items should allow mass moving by drag n drop ?
 * download link won't propose to save file in Firefox 20 if not same origin, we could force download from server side [unifile]
 */

/* Config */
angular.module('ceConf', [])

	.constant( 'server.url', 'http://127.0.0.1\\:5000/v1.0/' )

	.constant( 'server.url.unescaped', 'http://127.0.0.1:5000/v1.0/' ) // Need to get rid of this as soon as we use an angular version that is not buggy on this

	.constant( 'console.level', 0 ) // 0: DEBUG, 1: INFO, 2: WARNING, 3: ERROR, 4: NOTHING (no console)

	.config(['$httpProvider', function($httpProvider)
	{
		delete $httpProvider.defaults.headers.common["X-Requested-With"];
		$httpProvider.defaults.useXDomain = true;
		$httpProvider.defaults.withCredentials = true;
	}]);


/* Services */
angular.module('ceServices', ['ngResource', 'ceConf'])

	.factory('$ceConsoleSrv', [ '$rootScope', 'console.level', function( $rootScope, level )
	{
		return { 
			"log": function( msg, l ) { if ( l >= level ) $rootScope.$emit("log", msg, l); }
		};
	}])

	.factory('$unifileStub', ['$resource', 'server.url', function( $resource, serverUrl )
	{
		//return $resource(CEConfig.serverUrl+':service/:method/:command/?:path/', {}, {  // workaround: "?" is to keep a "/" at the end of the URL
		return $resource( serverUrl + ':service/:method/:command/:path ', {},
			{  // *very ugly* FIXME added space to keep the '/' at the end of the url
				listServices: {method:'GET', params:{service:'services', method:'list'}, isArray:true},
				connect: {method:'GET', params:{method:'connect'}, isArray:false},
				login: {method:'GET', params:{method:'login'}, isArray:false},
				ls: {method:'GET', params:{method:'exec', command:'ls'}, isArray:true},
				rm: {method:'GET', params:{method:'exec', command:'rm'}, isArray:false},
				mkdir: {method:'GET', params:{method:'exec', command:'mkdir'}, isArray:false},
				cp: {method:'GET', params:{method:'exec', command:'cp'}, isArray:false},
				mv: {method:'GET', params:{method:'exec', command:'mv'}, isArray:false},
				get: {method:'GET', params:{method:'exec', command:'get'}, isArray:true}
			});
	}])

	.service('$unifileUploadSrv', [ 'server.url.unescaped', '$http', '$ceConsoleSrv', function(serverUrl, $http, $ceConsoleSrv)
	{
		this.upload = function(uploadFiles, path)
		{
			var formData = new FormData();
			for(var i in uploadFiles)
			{
				formData.append('data', uploadFiles[i], uploadFiles[i].name);
			}
//console.log(formData);
			$http({
					method: 'POST',
					url: serverUrl+'dropbox/exec/put/'+path, // FIXME address as config value
					data: formData,
					headers: {'Content-Type': undefined},
					transformRequest: angular.identity
				})
				.success(function(data, status, headers, config) {
					$ceConsoleSrv.log("file(s) successfully sent", 0);
				});
		}
	}])

	.factory('$unifileSrv', ['$unifileStub', function($unifileStub)
	{
		// array of available services from unifile
		var services;
		// the current navigation data
		var currentNav; // looks like { "path": "...", "files": [...], "srv": "..." }
		// the clipboard var used for copy/paste 
		var clipboard;

		function listServices() { 
			if (services == undefined)
			{
				services = []; // value used by data bindings while the response until the next call has arrived
				$unifileStub.listServices({}, function(list){ services = list; });
			}
			return services;
		}
		function connect(srvName, cb) {
			for (var si = 0; si < services.length; si++) // FIXME angular 1.1.3 doesn't accept both filter and associative arrays in ng-repeat. As soon as it does, optimize it to make services an associative array
			{
				if (services[si]["name"]!=srvName)
				{
					continue;
				}
				if (!services[si]["isConnected"])
				{
					var res = $unifileStub.connect({service:srvName}, function ()
						{ //console.log("Connected. Auth url is: "+res.authorize_url);
							cb(res.authorize_url);
						},
						function()
						{
							console.error("ERROR: Could not connect to "+srvName); // TODO extract some info about the error
						}); //console.log("Connected");
				}
				return;
			}
		}
		function login(srvName) {
			for (var si = 0; si < services.length; si++) // FIXME angular 1.1.3 doesn't accept both filter and associative arrays in ng-repeat. As soon as it does, optimize it to make services an associative array
			{
				if (services[si]["name"]!=srvName)
				{
					continue;
				}
				if (!services[si]["isConnected"])
				{
					var res = $unifileStub.login({service:srvName}, function (status)
						{
							if (res.success == true)
							{
								services[si]["isConnected"] = true;
							}
							else
							{
								services[si]["isConnected"] = false;
							}
						},
						function (obj) // FIXME
						{
							console.error('Could not login. Try connect first, then follow the auth URL and try login again.');
							console.error(obj.data); // FIXME
							console.error(obj.status); // FIXME
							services[si]["isConnected"] = false;
						});
				}
				return;
			}
		}
		function cd(srvName, path) { console.log("cd("+srvName+", "+path+")");
			$unifileStub.ls({service:srvName, path:path}, function (res)
				{
					console.log("cd command returned "+res.length+" elts for service "+srvName);
					currentNav = { "srv": srvName, "path": path, "files": res };
				});
		}
		function mv(srvName, oldPath, newPath) {
			$unifileStub.mv({service:srvName, path:oldPath+':'+newPath});
		}
		function copy() {
			clipboard = [];
			var rp = '';
			if (currentNav["path"]!='' && currentNav["path"]!=undefined)
			{
				rp = currentNav["path"] + '/';
			}
			for(var fi in currentNav['files'])
			{
				if (currentNav['files'][fi]['isSelected']===true) { 
					clipboard.push(rp+currentNav['files'][fi]['name']);
				}
			}
		}
		function remove() { // FIXME refresh model once done
			for(var fi in currentNav.files)
			{
				if (currentNav.files[fi].isSelected===true)
				{
					var fp = currentNav.path;
					if (fp != '')
					{
						fp += '/';
					}
					fp += currentNav.files[fi].name;
					$unifileStub.rm({service:currentNav.srv, path:fp});
				}
			}
		}
		function paste() { // FIXME refresh model once done
			if (clipboard === undefined)
			{
				return;
			}
			var rp = '';
			if (currentNav["path"]!='' && currentNav["path"]!=undefined)
			{
				rp = currentNav["path"] + '/';
			}
			for (var fi in clipboard)
			{
				var nfp = rp + clipboard[fi].substr(clipboard[fi].lastIndexOf('/')+1);
				
				$unifileStub.cp({service:currentNav["srv"], path:clipboard[fi]+':'+nfp}, function(){
					console.log("copy done");
					// TODO refresh model or view ?
				});
			}
		}
		function isCorrectFileName(name)
		{
			if (name === undefined || name == "")
			{
				return false;
			}
			//TODO other checks on characters used...
			return true;
		}
		function mkdir(mkdirName) {
			$unifileStub.mkdir({service:currentNav.srv, path:currentNav.path+mkdirName}, function () {
					console.log("new "+mkdirName+" directory created.");
				});
		}
		function togleSelect(file) {
			for(var fi in currentNav.files)
			{
				if (currentNav.files[fi] == file)
				{
					if (currentNav.files[fi]["isSelected"])
					{
						currentNav.files[fi]["isSelected"] = !currentNav.files[fi]["isSelected"];
					}
					else
					{
						currentNav.files[fi]["isSelected"] = true;
					}
					currentNav.files[fi]["lastSelectionDate"] = Date.now();
					return;
				}
			}
		}
		return {
			services: function() { return services; },
			currentNav: function() { return currentNav; },
			clipboard: function() { return clipboard; },
			listServices: listServices,
			connect: connect,
			login: login,
			cd: cd,
			mv: mv,
			copy: copy,
			remove: remove,
			paste: paste,
			mkdir:mkdir,
			isCorrectFileName: isCorrectFileName,
			togleSelect: togleSelect
		};
	}]);


/* Controllers */
angular.module('ceCtrls', ['ceServices'])

	/**
	 * Controls the "connect to service" button
	 */
	.controller('CEConnectBtnCtrl', ['$scope', '$window', '$unifileSrv', function($scope, $window, $unifileSrv)
		{
			// bind the services list
			$scope.$watch( $unifileSrv.listServices, function (services) {
				$scope.services = services;
			});
			/**
			 * Opens the application authorization popup for the given service
			 */
			function authorize(url, serviceName)
			{
				var authPopup = $window.open(url, 'authPopup', 'height=500,width=700,dialog'); // FIXME parameterize size? per service ?
				authPopup.owner = $window;
				if ($window.focus) { authPopup.focus() }
				if (authPopup)
				{
					// timer based solution until we find something better to listen to the child window events (close, url change...)
					var timer = setInterval(function() 
						{
							if (authPopup.closed)
							{
								clearInterval(timer);
								$scope.$apply( function($scope){$unifileSrv.login(serviceName);} ); // since 1.1.4, need to wrap call in $apply, not sure why...
							}
						}, 500);
				}
				else
				{
					console.error('Popup could not be opened');
				}
			}
			/**
			 * Connect to service
			 */
			$scope.connect = function(srv)
			{
				if (!srv.isConnected)
				{
					//console.log("Connecting to "+srv.name);
					$unifileSrv.connect(srv.name, function(url){ authorize(url, srv.name); });
				}
				else
				{
					console.log("Already connected to "+srv.name);
				}
			};
			$scope.srvLinkClass = function (srv)
			{ //console.log("srvLinkClass "+srv.isConnected);
				if (srv.isConnected)
				{
					return "ce-srv-connected";
				}
				return "ce-srv-not-connected";
			}
		}])

	/**
	 * Controls the browser left pane
	 */
	.controller('CELeftPaneCtrl', ['$scope', '$unifileSrv', '$unifileStub', function($scope, $unifileSrv, $unifileStub)
		{
			// the services folder tree
			$scope.tree = {}; // { "dropbox" => [  ], "gdrive" => [  ] }
			// scope contains the service + folders tree and need to be able to enable/disable a branch (service) id its isConnected flag changes
			$scope.$watch( $unifileSrv.services, servicesChanged, true);
			$scope.$watch( $unifileSrv.currentNav, currentNavChanged, true);
			/**
			 *
			 */
			function servicesChanged(services)
			{
				for (var s in services)
				{
					if (services[s]["isConnected"]===true && !$scope.tree.hasOwnProperty(services[s]["name"]))
					{
						//console.log(services[s]["name"]+" connected but no data found in tree. Performing ls()...");
						var sname = services[s]["name"]; // cannot use s in cb functions below (don't know why...)
						if ( $unifileSrv.currentNav() == undefined )
						{
							// if tree empty we set current dir
							$unifileSrv.cd(sname, "");
						}
						else
						{ console.log("$unifileSrv.currentNav already set so do not change it");
							// if tree not empty, we do not want to change current dir automatically
							$unifileStub.ls({service:sname, path:""}, function (res)
							{
								$scope.tree[ sname ] = res;
							});
						}
					}
					else if (!services[s]["isConnected"] && $scope.tree.hasOwnProperty(services[s]["name"]))
					{
						//TODO remove service from tree
						console.log("TODO remove service from tree");
					}
				}
			}
			/**
			 * 
			 */
			function currentNavChanged(currNav)
			{
				if (currNav!=undefined)
					$scope.tree[currNav.srv] = appendToTree( $scope.tree[currNav.srv], currNav.path, currNav.files );
			}
			/**
			 * Creates or updates the tree
			 */
			function appendToTree( tree, path, files )
			{
				if ( path == '' || path == undefined )
				{
					return files;
				}
				var np;

				if (path.indexOf('/') != -1)
				{
					np = path.substring( 0, path.indexOf('/') );
					path = path.substring(path.indexOf('/') + 1);
				}
				else
				{
					np = path;
					path = '';
				}
				var ci = -1;

				for (ci = 0; ci < tree.length; ci++)
				{
					if (tree[ci].name == np && tree[ci].is_dir == true)
					{
						break;
					}
				}
				if (ci == tree.length || ci == -1)
				{
					throw(Error('No jump allowed yet : at ci='+ci));
				}
				tree[ci]['children'] = appendToTree( tree[ci]['children'], path, files );

				return tree;
			}
		}])

	/**
	 * Controls the browser right pane
	 */
	.controller('CERightPaneCtrl', ['$scope', '$unifileSrv', function($scope, $unifileSrv)
		{
			// scope contains the current path, the list of folders and files in the current path
			$scope.$watch( $unifileSrv.currentNav, currentNavChanged, true);
			/**
			 *
			 */
			function currentNavChanged(currNav)
			{ //console.log("[CERightPaneCtrl] currentNavChanged in right pane and equals "+currNav);
				if (currNav!==undefined)
				{ //console.log("right pane files set");
					$scope.path = currNav.path;
					$scope.srv = currNav.srv;
					$scope.files = currNav.files;
					$scope.isEmptySelection = true;
					for(var fi in $scope.files)
					{
						if ($scope.files[fi].isSelected===true)
						{
							$scope.isEmptySelection = false;
							break;
						}
					}
				}
			}
			$scope.isCtrlBtnsVisible = function() {
				return ($unifileSrv.currentNav() !== undefined);
			}
			$scope.showLinkToParent = function()
			{
				if ( $scope.path == undefined || $scope.path == '' || $scope.path == '/' )
				{
					return false;
				}
				return true;
			};
			/**
			 * mkdir command
			 */
			$scope.doMkdir = function(mkdirName)
			{
				if (!$unifileSrv.isCorrectFileName(mkdirName))
				{
					console.log("WARNING: name given for new directory is not valid: "+mkdirName);
					//TODO show this either in console or through a new alert service
				}
				else
				{
					console.log("creating directory "+mkdirName+" in "+$scope.srv+":"+$scope.path);
					$unifileSrv.mkdir(mkdirName);
					$scope.mkdirOn = false; // fixme, should be set to false when server response received
				}
			}
			$scope.isEmptyClipboard = function() {
				return ($unifileSrv.clipboard() === undefined);
			}
			$scope.remove = function() {
				$unifileSrv.remove();
			}
			$scope.copy = function()
			{
				$unifileSrv.copy();
			};
			$scope.paste = function()
			{
				$unifileSrv.paste();
			};
		}])

	/**
	 * This controller is shared by the ceFile and ceFolder directives.
	 */
	.controller('CEFileEntryCtrl', ['$scope', '$element', '$unifileUploadSrv', '$unifileSrv', '$unifileStub', 'server.url.unescaped', function($scope, $element, $unifileUploadSrv, $unifileSrv, $unifileStub, serverUrl)
		{
			function getFilePath() {
				var fp = $scope.path;

				if ($scope.file != null)
				{
					if (fp != '')
					{
						fp += '/';
					}
					fp += $scope.file.name;
				}
				return fp;
			}
			$scope.filePath = getFilePath(); console.log('$scope.filePath= '+$scope.filePath);
			$scope.fileSrv = $scope.srv; console.log('$scope.fileSrv= '+$scope.fileSrv);
			$scope.renameOn = false;
			// can be dir, file or both
			$scope.isFile = false;
			$scope.isDir = false;

			/**
			 * TODO comment
			 */
			$scope.setLinkToParent = function()
			{
				$scope.$watch('path', function() {
					if ( $scope.path != undefined && $scope.path != '' && $scope.path != '/' )
					{
						var p = $scope.path;
						if (p.lastIndexOf('/') == p.length-1) p = p.substr(0, p.length-1);
						$scope.filePath = p.substr(0, p.lastIndexOf('/'));
					}
				});
			};
			/**
			 * TODO comment
			 */
			$scope.enterDir = function()
			{
console.log("Entering within "+$scope.fileSrv+":"+$scope.filePath);
				if ($scope.file != null && $scope.file.is_dir || $scope.file == null)
				{
					$unifileSrv.cd($scope.fileSrv, $scope.filePath);
				}
			};
			$scope.select = function()
			{
console.log("simple click received");
				var lastSel = $scope.file["lastSelectionDate"];
				$unifileSrv.togleSelect($scope.file);
				if (lastSel)
				{
					var diff = ($scope.file["lastSelectionDate"] - lastSel);
					if (diff < 2000 && diff > 500) // FIXME those values should be config constants
					{
						$scope.rename("");
					}
				}
			};

			/**
			 * TODO comment
			 */
			$scope.handleDragStart = function(e)
			{
console.log("ceFile => dragStart,  e.target= "+e.target+",  path= "+$scope.filePath);
				e.originalEvent.dataTransfer.effectAllowed = 'move';
				e.originalEvent.dataTransfer.setData('text', $scope.filePath);

				$element.addClass("ce-file-drag"); // FIXME make it a param in conf?
			};
			/**
			 * TODO comment
			 */
			$scope.handleDragEnd = function(e)
			{
//console.log( "ceFile => dragEnd  file= " + e.originalEvent.dataTransfer.getData('text') );
				$element.removeClass("ce-file-drag"); // FIXME make it a param in conf?
			};

			/**
			 * TODO comment
			 */
			$scope.getClass = function()
			{
				var fic = [];
				if ($scope.file != null && $scope.file.isSelected === true)
				{
					fic.push("ce-file-selected");
				}
				if ($scope.file != null && !$scope.file.is_dir)
				{
					fic.push("is-dir-false");
				}
				else
				{
					fic.push("is-dir-true");
				}
				return fic.join(" ");
			};

			/**
			 * TODO comment
			 */
			$scope.handleDragEnter = function(e) // TODO manage styles
			{
				e.preventDefault();
//console.log("e.target= "+e.target);
				$element.addClass("ce-folder-over"); // FIXME make it a param in conf?
			};
			/**
			 * TODO comment
			 */
			$scope.handleDragLeave = function(e) // TODO manage styles
			{
//console.log("e.target= "+e.target);
				$element.removeClass("ce-folder-over"); // FIXME make it a param in conf?
			};
			/**
			 * TODO comment
			 */
			$scope.handleDragOver = function(e)
			{
				if ( e.preventDefault )
				{
					e.preventDefault(); // Necessary. Allows us to drop.
				}
				e.originalEvent.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

				return false;
			};
			/**
			 * TODO comment
			 */
			$scope.handleDrop = function(e)
			{
//console.log("drop ");
				e.stopPropagation();
				e.preventDefault();
				
				if ( e.originalEvent.dataTransfer.files && e.originalEvent.dataTransfer.files.length > 0 ) // case files from desktop
				{
//console.log("files from desktop case upload to: " + $scope.filePath);
					$unifileUploadSrv.upload( e.originalEvent.dataTransfer.files, $scope.filePath+'/' );
				}
				else // move case
				{
					var evPath = e.originalEvent.dataTransfer.getData('text');
					if ( $scope.filePath == evPath )
					{
						console.log("NOTICE: cannot move a folder into itself!");
					}
					else
					{
//console.log("move " + evPath + " to: " + $scope.filePath+'/'+evPath.substr(evPath.lastIndexOf('/')+1)); // NOTE: new path will probably need to be concatenated with file '/'+name
						$unifileSrv.mv($scope.fileSrv, evPath, $scope.filePath+'/'+evPath.substr(evPath.lastIndexOf('/')+1));
					}
				}
			};
			/**
			 * TODO comment
			 */
			$scope.download = function()
			{
				return serverUrl+$scope.fileSrv+'/exec/get/'+$scope.filePath; // FIXME make it a conf param
			};
			/**
			 * TODO comment
			 */
			$scope.rename = function(newName)
			{
				if (!$scope.renameOn)
				{ console.log("rename called and now on");
					$scope.renameOn = true;
				}
				else
				{ console.log("rename called and now off");
					if (!$unifileSrv.isCorrectFileName(newName))
					{
						console.log("WARNING: won't rename, incorrect file/folder name given: "+newName);
						// TODO show error somewhere in console or through a new alert service
					}
					else
					{
						var newPath = $scope.filePath.substr(0, $scope.filePath.lastIndexOf('/') + 1) + newName;

						// FIXME
						$unifileStub.mv({service: $scope.fileSrv, path: $scope.filePath + ':' + newPath}, function()
							{
								$scope.filePath = newPath;
								$scope.file.name = newName;
								$scope.renameOn = false;
							});
					}
				}
			};
			/**
			 * TODO comment
			 */
			$scope.copy = function()
			{
				$unifileSrv.copy($scope.filePath);
			};
		}
	])

	.controller('CEConsoleCtrl', [ '$scope', '$element', function( $scope, $element )
	{
		function onLogEntry( event, msg, l )
		{
			event.stopPropagation();
			$element.append("<li>"+l+": "+msg+"</li>"); // FIXME see if we can use some kind of template here...
		}
		$scope.$on("log", onLogEntry);
	}]);

/* Directives */
angular.module('ceDirectives', [ 'ceConf', 'ceServices', 'ceCtrls' ])

	.directive('fileUploader', function()
	{
		return {
			restrict: 'A',
			transclude: true,
			template: '<div class="fileUploader"><input type="file" multiple /><button ng-click="upload()">Upload</button></div>',
			replace: true,
			controller: function($scope, $unifileUploadSrv)
			{
				$scope.notReady = true;

				$scope.push = function(e)
				{
console.log('change $scope.uploadFiles = '+$scope.uploadFiles);
					$scope.notReady = e.target.files.length == 0;
					$scope.uploadFiles = [];
					for(var i in e.target.files)
					{
						if(typeof e.target.files[i] == 'object') $scope.uploadFiles.push(e.target.files[i]);
					}
console.log('end change $scope.uploadFiles = '+$scope.uploadFiles);
					$unifileUploadSrv.upload($scope.uploadFiles, $scope.path);
				}
			},
			link: function($scope, $element)
			{
				var fileInput = $element.find('input');

				$scope.upload = function() { fileInput.trigger('click'); console.log( "browse called "); };

				fileInput.bind('change', $scope.push);
			}
		};
	})

	// the "new folder" button
	.directive('ceMkdirBtn', function()
	{
		return {
			restrict: 'A',
			template: '<button ng-click="mkdir()">New folder</button>',
			replace: 'true',
			controller: function($scope)
			{
				$scope.mkdir = function()
				{
					$scope.mkdirOn = true;
				}
			}
		};
	})

	// this is the CE browser log console
	.directive('ceConsole', function()
	{
		return {
			restrict: 'A',
			replace: true,
			template: '<ul class="ce-log-console"></ul>',
			controller: 'CEConsoleCtrl'
		};
	})

	// this directive implements the behavior of receiving a file/folder on drop
	.directive('ceItem', function()
	{
		return {
			restrict: 'C',
			controller: 'CEFileEntryCtrl'
		};
	})

	// this directive implements the behavior of receiving a file/folder on drop
	.directive('ceFolder', function()
	{
		return {
			priority: 1,
			restrict: 'A',
			link: function(scope, element, attrs)
			{
				scope.isDir = true;
				attrs.$set('dropzone', 'move');
				attrs.$set('draggable', 'false'); // necessary to avoid folders that aren't files to be draggable

				//element.bind('dblclick', scope.enterDir ); // not set with ng-click 'cause we need to be able to unbind it at some points (renaming, ...)
				element.bind('dblclick', function(e) { scope.$apply(function(scope){scope.enterDir(e);}); } ); // not set with ng-click 'cause we need to be able to unbind it at some points (renaming, ...)
				element.bind('dragenter', function(e) { scope.$apply(function(scope){scope.handleDragEnter(e);}); } );
				element.bind('dragleave', function(e) { scope.$apply(function(scope){scope.handleDragLeave(e);}); } );
				element.bind('dragover', function(e) { scope.$apply(function(scope){scope.handleDragOver(e);}); } );
				element.bind('drop', function(e) { scope.$apply(function(scope){scope.handleDrop(e);}); } );
			}
		};
	})

	// this directive implements the behavior of mooving a file on drag
	.directive('ceFile', function()
	{
		return {
			restrict: 'A',
			link: function(scope, element, attrs)
			{
				scope.isFile = true;
				attrs.$set('draggable', 'true');

				//element.bind('click', scope.select );
				element.bind('click', function(e) { scope.$apply(function(scope){scope.select(e);}); } );
				element.bind('dragstart', function(e) { scope.$apply(function(scope){scope.handleDragStart(e);}); } );
				element.bind('dragend', function(e) { scope.$apply(function(scope){scope.handleDragEnd(e);}); } );
			}
		};
	})

	// this directive implements the Connect button
	.directive('ceConnectBtn', function()
	{
		return {
			restrict: 'A',
			replace: true,
			template: '<div class="btn-group"> \
							<a class="btn dropdown-toggle" data-toggle="dropdown">Connect <span class="caret"></span></a> \
							<ul class="dropdown-menu"> \
								<li ng-repeat="srv in services"><a ng-class="srvLinkClass(srv)" ng-click="connect(srv)">{{srv.display_name}}</a></li> \
							</ul> \
						</div>',
			controller: 'CEConnectBtnCtrl'
		};
	})

	// the browser left pane directive
	.directive('ceLeftPane',  function()
	{
		return {
			restrict: 'A',
			replace: true,
			template: "<div> \
						<script type=\"text/ng-template\" id=\"tree_item_renderer.html\"> \
							<span class=\"ce-item is-dir-true\" ce-folder ng-click=\"enterDir()\">{{file.name}}</span> \
							<ul class=\"tree\" ng-init=\"path=filePath;\"> \
								<li ng-repeat=\"file in file.children | filter:{'is_dir':true}\" ng-include=\"'tree_item_renderer.html'\"></li> \
							</ul> \
						</script> \
						<ul class=\"tree\"> \
							<li ng-repeat=\"(srvTreeK, srvTreeV) in tree\" ng-init=\"srv=srvTreeK; path='';\"> \
								<span class=\"ce-item\" ce-folder ng-click=\"enterDir()\" ng-class=\"srvTreeK\">{{ srvTreeK }}</span> \
								<ul class=\"tree\"> \
									<li ng-repeat=\"file in srvTreeV | filter:{'is_dir':true}\" ng-include=\"'tree_item_renderer.html'\" onload=\"srv=srvTreeK; path='';\"></li> \
								</ul> \
							</li> \
						</ul> \
					</div>",
			controller: 'CELeftPaneCtrl'
		};
	})

	// the browser right pane directive
	// FIXME: The download link will not dl but open in FF20 if not same origin thus the blank target
	.directive('ceRightPane',  function()
	{
		return {
			restrict: 'C',
			replace: true,
			template: "<div> \
						<ul> \
							<li ng-show=\"isCtrlBtnsVisible()\"> \
								<div file-uploader></div> <div ce-mkdir-btn></div> <button ng-hide=\"isEmptySelection\" ng-click=\"copy()\">Copy</button> <button ng-hide=\"isEmptyClipboard()\" ng-click=\"paste()\">Paste</button> <button ng-hide=\"isEmptySelection\" ng-click=\"remove()\">Delete</button> \
							</li> \
							<li ng-if=\"showLinkToParent()\"><span ng-init=\"setLinkToParent()\" class=\"ce-item is-dir-true\" ce-folder>..</span></li> \
							<li class=\"ce-item\" ng-repeat=\"file in files | orderBy:'is_dir':true\"> \
								<div ng-hide=\"renameOn\" ng-if=\"file.is_dir\" ce-folder ce-file ng-class=\"getClass()\"><span>{{file.name}}</span></div> \
								<div ng-hide=\"renameOn\" ng-if=\"!file.is_dir\" ce-file ng-class=\"getClass()\"><span>{{file.name}}</span></div> \
								<div ng-if=\"renameOn\" ng-class=\"getClass()\"><form ng-submit=\"rename(newName)\"><input type=\"text\" ng-model=\"newName\" ng-init=\"newName=file.name\" /></form></div> \
								<a ng-hide=\"file.is_dir\" ng-href=\"{{download()}}\" download=\"{{file.name}}\" target=\"blank\">download</a> \
							</li> \
							<li class=\"ce-new-item\" ng-if=\"mkdirOn\"> \
								<div class=\"is-dir-true\"><form ng-submit=\"doMkdir(mkdirName)\"><input type=\"text\" ng-model=\"mkdirName\" /></form></div> \
							</li> \
						</ul> \
					</div>",
			controller: 'CERightPaneCtrl'
		};
	})

	// this is the root directive, the one you should use in your projects
	.directive('ceBrowser',  function()
	{
		return {
			restrict: 'A',
			replace: true,
			template: "<div class=\"ceBrowser\"> \
						<div class=\"row-fluid\"> \
							<div class=\"span4\"> \
								<div ce-connect-btn></div> \
							</div> \
						</div> \
						<div class=\"row-fluid\"> \
							<div class=\"span4\"> \
								<div ce-left-pane></div> \
							</div> \
							<div class=\"span8\"> \
								<div class=\"ce-right-pane\"></div> \
							</div> \
						</div> \
						<div class=\"row-fluid\"><div class=\"span12\" ce-console></div></div> \
					</div>"
		};
	});