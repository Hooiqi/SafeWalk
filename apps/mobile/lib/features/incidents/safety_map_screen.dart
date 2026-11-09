import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../services/location_service.dart';
import '../../services/realtime_service.dart';
import '../../widgets/campus_map.dart';
import 'incident_ui.dart';

/// The server refuses larger areas (proposal 5.2.3 3B: only what is in view).
const _maxSpanDegrees = 0.5;

/// Module 3: colour-coded safety map of verified incidents. Only the visible
/// area is loaded, and it reloads when security changes a verified incident.
class SafetyMapScreen extends StatefulWidget {
  const SafetyMapScreen({super.key});
  @override
  State<SafetyMapScreen> createState() => _SafetyMapScreenState();
}

class _SafetyMapScreenState extends State<SafetyMapScreen> {
  final _map = MapController();
  LatLng? _me;
  List<Incident> _incidents = const [];
  bool _loading = false;
  bool _tooWide = false;
  bool _truncated = false;
  String? _error;
  LatLngBounds? _bounds;
  Timer? _debounce;
  StreamSubscription<RealtimeEvent>? _events;

  @override
  void initState() {
    super.initState();
    _events = context.read<RealtimeChannel>().events.listen((e) {
      if (e.name == SocketEvents.incidentMap) _load();
    });
    context.read<LocationSource>().current().then((r) {
      if (!mounted) return;
      setState(() => _me = r.position);
      try {
        _map.move(r.position, 16);
      } catch (_) {}
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _events?.cancel();
    super.dispose();
  }

  void _onMove(MapCamera camera, bool _) {
    _bounds = camera.visibleBounds;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _load);
  }

  Future<void> _load() async {
    final b = _bounds;
    if (b == null || !mounted) return;
    if (b.north - b.south > _maxSpanDegrees || b.east - b.west > _maxSpanDegrees) {
      setState(() => _tooWide = true);
      return;
    }
    setState(() {
      _tooWide = false;
      _loading = true;
      _error = null;
    });
    try {
      final result = await context.read<IncidentsRepository>().inArea(south: b.south, west: b.west, north: b.north, east: b.east);
      if (!mounted) return;
      setState(() {
        _incidents = result.incidents;
        _truncated = result.truncated;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final String? banner = _error ??
        (_tooWide
            ? 'Zoom in to see incidents.'
            : _truncated
                ? 'Showing the most serious incidents here. Zoom in to see all.'
                : null);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Safety map'),
        actions: [
          TextButton.icon(
            onPressed: () => context.push('/incidents/mine'),
            icon: const Icon(Icons.assignment_outlined),
            label: const Text('My reports'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/incidents/report'),
        icon: const Icon(Icons.add_location_alt_outlined),
        label: const Text('Report'),
      ),
      body: Stack(children: [
        CampusMap(
          controller: _map,
          myPosition: _me,
          initialCenter: AppConfig.campusCenter,
          initialZoom: 16,
          onPositionChanged: _onMove,
          markersOnTop: true,
          markers: [
            for (final i in _incidents)
              Marker(
                point: i.location,
                width: 34,
                height: 34,
                child: IncidentPin(incident: i, onTap: () => showIncidentDetails(context, i)),
              ),
          ],
        ),
        Positioned(
          left: 12,
          right: 12,
          top: 12,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const _Legend(),
            if (banner != null) ...[
              const SizedBox(height: 8),
              Material(
                color: SwColors.surfaceRaised,
                borderRadius: BorderRadius.circular(SwRadius.inner),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  child: Row(children: [
                    Expanded(child: Text(banner, style: text.bodySmall?.copyWith(color: _error != null ? SwColors.error : SwColors.text2))),
                    if (_error != null) TextButton(onPressed: _load, child: const Text('Retry')),
                  ]),
                ),
              ),
            ] else if (!_loading && _incidents.isEmpty && _bounds != null) ...[
              const SizedBox(height: 8),
              Material(
                color: SwColors.surfaceRaised,
                borderRadius: BorderRadius.circular(SwRadius.inner),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  child: Text('No verified incidents in this area.', style: text.bodySmall),
                ),
              ),
            ],
          ]),
        ),
        if (_loading)
          const Positioned(left: 0, right: 0, bottom: 0, child: LinearProgressIndicator(minHeight: 3)),
      ]),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) => Material(
        color: SwColors.surface.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(SwRadius.inner),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(children: [
            Expanded(
              child: Text('Verified incidents', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: SwColors.text2)),
            ),
            for (final s in IncidentSeverity.all) ...[
              const SizedBox(width: 10),
              SeverityLabel(s, suffix: ''),
            ],
          ]),
        ),
      );
}
