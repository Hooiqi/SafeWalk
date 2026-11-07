import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/config.dart';
import '../core/theme.dart';

/// OpenStreetMap map (flutter_map, the Dart counterpart of Leaflet) with
/// SafeWalk's markers. OSM tiles are darkened to match the interface.
class CampusMap extends StatelessWidget {
  const CampusMap({
    super.key,
    this.controller,
    this.myPosition,
    this.destination,
    this.route = const [],
    this.onTap,
    this.initialCenter,
    this.initialZoom = 16,
    this.markers = const [],
  });

  final MapController? controller;
  final LatLng? myPosition;
  final LatLng? destination;
  final List<LatLng> route;
  final void Function(LatLng point)? onTap;
  final LatLng? initialCenter;
  final double initialZoom;

  /// Additional markers (e.g. safe points), drawn under the user's position.
  final List<Marker> markers;

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: controller,
      options: MapOptions(
        initialCenter: initialCenter ?? myPosition ?? AppConfig.campusCenter,
        initialZoom: initialZoom,
        minZoom: 13,
        maxZoom: 19,
        backgroundColor: SwColors.background,
        onTap: onTap == null ? null : (_, point) => onTap!(point),
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
      ),
      children: [
        TileLayer(
          urlTemplate: AppConfig.tileUrl,
          userAgentPackageName: 'my.usm.safewalk',
          tileBuilder: darkModeTileBuilder,
        ),
        if (route.length > 1)
          PolylineLayer(polylines: [
            Polyline(points: route, color: SwColors.secondary, strokeWidth: 5),
          ]),
        MarkerLayer(markers: [
          ...markers,
          if (destination != null)
            Marker(
              point: destination!,
              width: 36,
              height: 36,
              child: const _DestinationPin(),
            ),
          if (myPosition != null)
            Marker(
              point: myPosition!,
              width: 26,
              height: 26,
              child: const _MyPositionDot(),
            ),
        ]),
        const RichAttributionWidget(
          alignment: AttributionAlignment.bottomLeft,
          attributions: [TextSourceAttribution('OpenStreetMap contributors')],
        ),
      ],
    );
  }
}

class _MyPositionDot extends StatelessWidget {
  const _MyPositionDot();
  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Your location',
        child: Container(
          decoration: BoxDecoration(
            color: SwColors.primary,
            shape: BoxShape.circle,
            border: Border.all(color: SwColors.text, width: 3),
          ),
        ),
      );
}

class _DestinationPin extends StatelessWidget {
  const _DestinationPin();
  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Destination',
        child: Container(
          decoration: BoxDecoration(
            color: SwColors.background,
            shape: BoxShape.circle,
            border: Border.all(color: SwColors.text, width: 3),
          ),
          child: const Icon(Icons.flag_rounded, size: 16, color: SwColors.text),
        ),
      );
}
