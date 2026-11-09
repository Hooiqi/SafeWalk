import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/formatting.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../services/location_service.dart';
import '../../services/phone_dialer.dart';
import '../../widgets/campus_map.dart';
import '../../widgets/common.dart';

/// Module 2: Nearest Safe Point Navigator. The server filters safe points by
/// opening hours, finds the nearest with PostGIS and ranks them by walking
/// time; this screen shows them on the map with hours, contacts and directions.
class SafePointsScreen extends StatefulWidget {
  const SafePointsScreen({super.key});
  @override
  State<SafePointsScreen> createState() => _SafePointsScreenState();
}

class _SafePointsScreenState extends State<SafePointsScreen> {
  final _map = MapController();
  LocationReading? _me;
  String? _locationError;
  List<SafePoint> _all = const [];
  int _pending = 0;
  List<SafePoint>? _nearest;
  String? _error;
  bool _loading = true;
  bool _showAll = false;
  SafePoint? _selected;
  RoutePreview? _route;
  bool _routing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final repo = context.read<SafePointsRepository>();
    final location = context.read<LocationSource>();
    try {
      final all = await repo.all();
      if (!mounted) return;
      setState(() {
        _all = all.points;
        _pending = all.pendingLocation;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
    try {
      final me = await location.current();
      if (!mounted) return;
      setState(() {
        _me = me;
        _locationError = null;
      });
      final nearest = await repo.nearest(me.position);
      if (!mounted) return;
      setState(() => _nearest = nearest);
      _fit([me.position, ...nearest.take(3).map((p) => p.location)]);
    } on LocationUnavailable catch (e) {
      if (mounted) setState(() => _locationError = e.message);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _locationError = 'Could not get your location. Showing all safe points instead.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _fit(List<LatLng> points) {
    if (points.length < 2) return;
    try {
      _map.fitCamera(CameraFit.bounds(
        bounds: LatLngBounds.fromPoints(points),
        padding: const EdgeInsets.all(48),
        maxZoom: 18,
      ));
    } catch (_) {/* map not ready */}
  }

  void _select(SafePoint p) {
    setState(() {
      _selected = p;
      _route = null;
    });
    try {
      _map.move(p.location, 17);
    } catch (_) {}
  }

  Future<void> _directions() async {
    final me = _me, target = _selected;
    if (me == null || target == null) return;
    setState(() => _routing = true);
    try {
      final route = await context.read<SafePointsRepository>().directions(target.id, me.position);
      if (!mounted) return;
      setState(() => _route = route);
      _fit([me.position, ...route.points]);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _routing = false);
    }
  }

  Future<void> _call(String number) async {
    final ok = await context.read<PhoneDialer>().call(number);
    if (!ok && mounted) showMessage(context, 'Could not open the phone app. Dial ${formatPhone(number)} yourself.');
  }

  List<Marker> get _markers => [
        for (final p in _all)
          Marker(
            point: p.location,
            width: p.id == _selected?.id ? 40 : 30,
            height: p.id == _selected?.id ? 40 : 30,
            child: GestureDetector(
              onTap: () => _select(p),
              child: _SafePointPin(point: p, selected: p.id == _selected?.id),
            ),
          ),
      ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Safe points'),
        actions: [IconButton(tooltip: 'Refresh', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh_rounded))],
      ),
      body: Column(children: [
        Expanded(
          flex: 5,
          child: CampusMap(
            controller: _map,
            myPosition: _me?.position,
            route: _route?.points ?? const [],
            markers: _markers,
          ),
        ),
        Expanded(
          flex: 6,
          child: Container(
            decoration: const BoxDecoration(color: SwColors.surface, border: Border(top: BorderSide(color: SwColors.border))),
            child: _selected != null ? _detail(_selected!) : _list(),
          ),
        ),
      ]),
    );
  }

  Widget _list() {
    final text = Theme.of(context).textTheme;
    if (_loading && _all.isEmpty) return const Center(child: CircularProgressIndicator());
    if (_error != null && _all.isEmpty) return ErrorView(message: _error!, onRetry: _load);
    if (_all.isEmpty) {
      return EmptyView(
        icon: Icons.shield_outlined,
        title: 'No safe points on the map yet',
        message: _pending > 0
            ? '$_pending official safe points are waiting for USM Security to set their map location. In an emergency, use SOS or call for help.'
            : 'USM Security has not published any safe points yet.',
      );
    }
    final shown = _showAll || _nearest == null ? ([..._all]..sort((a, b) => a.name.compareTo(b.name))) : _nearest!;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 24), children: [
      Row(children: [
        Expanded(
          child: Text(
            _showAll || _nearest == null ? 'All safe points' : 'Nearest open now',
            style: text.titleMedium,
          ),
        ),
        if (_nearest != null)
          TextButton(onPressed: () => setState(() => _showAll = !_showAll), child: Text(_showAll ? 'Nearest' : 'Show all')),
      ]),
      if (_locationError != null)
        Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_locationError!, style: const TextStyle(color: SwColors.secondary))),
      if (!_showAll && _nearest != null && _nearest!.isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('No safe point on the map is open right now. Use SOS or call USM Security.'),
        ),
      for (final p in shown) _SafePointTile(point: p, onTap: () => _select(p)),
      if (_pending > 0)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text('$_pending more official safe points will appear once USM Security sets their map location.', style: text.bodySmall),
        ),
    ]);
  }

  Widget _detail(SafePoint p) {
    final text = Theme.of(context).textTheme;
    final route = _route;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
      Row(children: [
        IconButton(
          tooltip: 'Back to list',
          onPressed: () => setState(() {
            _selected = null;
            _route = null;
          }),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        Expanded(child: Text(p.name, style: text.titleMedium)),
      ]),
      Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            StatusBadge(openingLabel(p.opening), tone: p.opening.isOpen ? BadgeTone.neutral : BadgeTone.done),
            Text(SafePointCategory.label(p.category), style: text.bodySmall),
          ]),
          const SizedBox(height: 10),
          Text(p.operatingHours),
          if (p.locationDescription != null) ...[const SizedBox(height: 4), Text(p.locationDescription!, style: text.bodySmall)],
          if (p.notes != null) ...[const SizedBox(height: 4), Text(p.notes!, style: text.bodySmall)],
          if (p.contactNotes != null) ...[const SizedBox(height: 4), Text(p.contactNotes!, style: text.bodySmall)],
          const SizedBox(height: 14),
          Row(children: [
            if (p.contactPhone != null)
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _call(p.contactPhone!),
                  icon: const Icon(Icons.call_rounded),
                  label: const Text('Call'),
                ),
              ),
            if (p.contactPhone != null) const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: _me == null || _routing ? null : _directions,
                icon: const Icon(Icons.directions_walk_rounded),
                label: Text(_routing ? 'Loading…' : 'Directions'),
              ),
            ),
          ]),
          if (_me == null)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text('Directions need your location.', style: text.bodySmall)),
          if (route != null) ...[
            const SizedBox(height: 16),
            Text('${formatDuration(route.duration)} walk · ${formatDistance(route.distanceM)}', style: text.titleMedium),
            if (route.isEstimate)
              Text('Routing service unavailable: the line is a straight-line estimate, follow paths you know.', style: text.bodySmall),
            const SizedBox(height: 8),
            for (final (i, s) in route.steps.indexed)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  SizedBox(width: 28, child: Text('${i + 1}.', style: text.bodySmall)),
                  Expanded(child: Text(s.instruction)),
                  if (s.distanceM > 0) Text(formatDistance(s.distanceM), style: text.bodySmall),
                ]),
              ),
          ],
        ]),
      ),
    ]);
  }
}

/// "Open 24 hours", "Open · closes 5:10 PM", "Closed · opens Mon 8:10 AM".
String openingLabel(OpeningStatus o, {DateTime? now}) {
  if (o.always) return 'Open 24 hours';
  final today = (now ?? DateTime.now()).toLocal();
  String when(DateTime t) {
    final local = t.toLocal();
    final sameDay = local.year == today.year && local.month == today.month && local.day == today.day;
    return sameDay ? formatTime(local) : DateFormat('EEE h:mm a').format(local);
  }

  if (o.isOpen) return o.closesAt == null ? 'Open now' : 'Open · closes ${when(o.closesAt!)}';
  return o.opensAt == null ? 'Closed' : 'Closed · opens ${when(o.opensAt!)}';
}

class _SafePointTile extends StatelessWidget {
  const _SafePointTile({required this.point, required this.onTap});
  final SafePoint point;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final walk = point.walking;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        leading: _SafePointPin(point: point, selected: false),
        title: Text(point.name, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(
          '${SafePointCategory.label(point.category)} · ${openingLabel(point.opening)}',
          style: text.bodySmall,
        ),
        trailing: walk == null
            ? const Icon(Icons.chevron_right_rounded)
            : Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(formatDuration(walk.duration), style: const TextStyle(fontWeight: FontWeight.w700)),
                Text('${walk.isEstimate ? '~' : ''}${formatDistance(walk.distanceM)}', style: text.bodySmall),
              ]),
      ),
    );
  }
}

class _SafePointPin extends StatelessWidget {
  const _SafePointPin({required this.point, required this.selected});
  final SafePoint point;
  final bool selected;

  static IconData iconFor(String category) => switch (category) {
        SafePointCategory.securityPost => Icons.shield_rounded,
        SafePointCategory.medical => Icons.local_hospital_rounded,
        SafePointCategory.studyArea => Icons.menu_book_rounded,
        SafePointCategory.residentialCollege => Icons.home_rounded,
        SafePointCategory.policeStation => Icons.local_police_rounded,
        _ => Icons.location_city_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final open = point.opening.isOpen;
    return Semantics(
      label: '${point.name}, ${open ? 'open' : 'closed'}',
      child: Opacity(
        opacity: open ? 1 : 0.5,
        child: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: selected ? SwColors.primary : SwColors.surfaceRaised,
            shape: BoxShape.circle,
            border: Border.all(color: selected ? SwColors.text : SwColors.secondary, width: 2),
          ),
          child: Icon(iconFor(point.category), size: 16, color: selected ? SwColors.onAccent : SwColors.text),
        ),
      ),
    );
  }
}
