## 4.0.1

* Allow `container` as an option for `loadMap()`, as the container in which to load the map instead of using a pane.


## 4.0.0

`@abi-software/flatmap-viewer@4.0.0` is the map viewer entirely in Typescript. 

Breaking changes are:

* The `MapManager` class has been renamed to `MapViewer`.
* `MapViewer` now requires two parameters, its server URL and options, of type `MapViewerOptions`, with a required `container` field (the id of the map’s HTML container).
* `MapViewer.loadMap()` no longer has a `container` parameter:
  
```
async loadMap(identifier: string, callback: FlatMapCallback, options: FlatMapOptions={}): Promise<FlatMap>
```

A MapViewer can have multiple panes within its container, by setting the `panes` field in the viewer’s options to the maximum number allowed (default is 1 pane). With more than one pane specified, `loadMap()` will create panes within the parent container in which to place maps — when the limit is reached the rightmost pane will be reused. Panes have a close button to allow them to be closed.

There are some (minimal) changes to support the ISAN maps, but essentially this release will be map-viewer going forward.
