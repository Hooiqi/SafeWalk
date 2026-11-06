import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/formatting.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../services/location_service.dart';
import '../../services/trip_tracker.dart';
import '../../widgets/campus_map.dart';
import '../../widgets/common.dart';
import '../contacts/contacts_controller.dart';

/// Module 1, Feature 1: pick a destination on the campus map, preview the
/// OSRM walking route and ETA, choose trusted contacts and start.
class StartJourneyScreen extends StatefulWidget {
  const StartJourneyScreen({super.key});
  @override
  State<StartJourneyScreen> createState() => _StartJourneyScreenState();
}

class _StartJourneyScreenState extends State<StartJourneyScreen> {
  final _map = MapController();
  final _label = TextEditingController();
  final Set<String> _selected = {};

  LocationReading? _origin;
  String? _locationError;
  bool _canOpenSettings = false;
  LatLng? _destination;
  RoutePreview? _preview;
  bool _routing = false;
  String? _routeError;
  bool _starting = false;

  @override
  void initState() {
    super.initState();
    _locate();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final contacts = context.read<ContactsController>();
      contacts.load().then((_) {
        // Pre-select when there is only one contact.
        if (mounted && contacts.contacts.length == 1) setState(() => _selected.add(contacts.contacts.first.id));
      });
    });
  }

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    setState(() => _locationError = null);
    try {
      final fix = await context.read<LocationSource>().current();
      if (!mounted) return;
      setState(() => _origin = fix);
      _map.move(fix.position, 17);
      if (_destination != null) _route();
    } on LocationUnavailable catch (e) {
      if (mounted) {
        setState(() {
          _locationError = e.message;
          _canOpenSettings = e.canOpenSettings;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _locationError = 'Could not get your location. Move to an open area and try again.');
    }
  }

  void _pickDestination(LatLng point) {
    setState(() {
      _destination = point;
      _preview = null;
    });
    _route();
  }

  Future<void> _route() async {
    final origin = _origin, destination = _destination;
    if (origin == null || destination == null) return;
    setState(() {
      _routing = true;
      _routeError = null;
    });
    try {
      final preview = await context.read<TripsRepository>().previewRoute(origin.position, destination);
      if (!mounted || destination != _destination) return;
      setState(() => _preview = preview);
      if (preview.points.length > 1) {
        _map.fitCamera(CameraFit.bounds(
          bounds: LatLngBounds.fromPoints([...preview.points, origin.position]),
          padding: const EdgeInsets.fromLTRB(48, 120, 48, 48),
          maxZoom: 18,
        ));
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _routeError = e.message);
    } finally {
      if (mounted) setState(() => _routing = false);
    }
  }

  Future<void> _start() async {
    final origin = _origin, destination = _destination;
    if (origin == null || destination == null || _selected.isEmpty) return;
    setState(() => _starting = true);
    try {
      final location = context.read<LocationSource>();
      final trip = await context.read<TripsRepository>().start(
            origin: origin.position,
            destination: destination,
            contactIds: _selected.toList(),
            destinationLabel: _label.text,
            batteryLevel: await location.batteryLevel(),
            accuracyM: origin.accuracyM,
          );
      if (!mounted) return;
      context.read<TripTracker>().begin(trip);
      context.go('/journey');
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final contacts = context.watch<ContactsController>();
    final ready = _origin != null && _preview != null && _selected.isNotEmpty && !_starting;

    return Scaffold(
      appBar: AppBar(title: const Text('Start a journey')),
      body: Column(children: [
        Expanded(
          child: Stack(children: [
            CampusMap(
              controller: _map,
              myPosition: _origin?.position,
              destination: _destination,
              route: _preview?.points ?? const [],
              onTap: _pickDestination,
            ),
            Positioned(
              left: 12,
              right: 12,
              top: 12,
              child: _MapHint(
                text: _locationError ??
                    (_origin == null
                        ? 'Finding your location…'
                        : _destination == null
                            ? 'Tap the map to set your destination'
                            : 'Tap again to change the destination'),
                isError: _locationError != null,
                action: _locationError == null
                    ? null
                    : TextButton(
                        onPressed: _canOpenSettings ? GeolocatorLocationSource.openSettings : _locate,
                        child: Text(_canOpenSettings ? 'Settings' : 'Retry'),
                      ),
              ),
            ),
          ]),
        ),
        _JourneySheet(
          label: _label,
          preview: _preview,
          routing: _routing,
          routeError: _routeError,
          hasDestination: _destination != null,
          contacts: contacts,
          selected: _selected,
          onToggle: (id) => setState(() => _selected.contains(id) ? _selected.remove(id) : _selected.add(id)),
          onRetryRoute: _route,
          onStart: ready ? _start : null,
          starting: _starting,
        ),
      ]),
    );
  }
}

class _MapHint extends StatelessWidget {
  const _MapHint({required this.text, required this.isError, this.action});
  final String text;
  final bool isError;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Material(
        color: SwColors.surface.withValues(alpha: 0.94),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: isError ? SwColors.primary : SwColors.border),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
          child: Row(children: [
            Icon(isError ? Icons.location_off_outlined : Icons.touch_app_outlined,
                size: 18, color: isError ? SwColors.primary : SwColors.textMuted),
            const SizedBox(width: 10),
            Expanded(child: Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(text))),
            ?action,
          ]),
        ),
      );
}

class _JourneySheet extends StatelessWidget {
  const _JourneySheet({
    required this.label,
    required this.preview,
    required this.routing,
    required this.routeError,
    required this.hasDestination,
    required this.contacts,
    required this.selected,
    required this.onToggle,
    required this.onRetryRoute,
    required this.onStart,
    required this.starting,
  });

  final TextEditingController label;
  final RoutePreview? preview;
  final bool routing;
  final String? routeError;
  final bool hasDestination;
  final ContactsController contacts;
  final Set<String> selected;
  final void Function(String id) onToggle;
  final VoidCallback onRetryRoute;
  final VoidCallback? onStart;
  final bool starting;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.5),
      decoration: const BoxDecoration(
        color: SwColors.surface,
        border: Border(top: BorderSide(color: SwColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 16, 16, 16), children: [
          // Route summary
          if (!hasDestination)
            Text('Choose where you are walking to.', style: text.bodyMedium?.copyWith(color: SwColors.textMuted))
          else if (routing)
            const Row(children: [
              SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
              SizedBox(width: 12),
              Text('Calculating walking route…'),
            ])
          else if (routeError != null)
            Row(children: [
              Expanded(child: Text(routeError!, style: const TextStyle(color: SwColors.primary))),
              TextButton(onPressed: onRetryRoute, child: const Text('Retry')),
            ])
          else if (preview != null) ...[
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(formatDuration(preview!.duration), style: text.headlineSmall),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text('walk · ${formatDistance(preview!.distanceM)}', style: text.bodyMedium?.copyWith(color: SwColors.textMuted)),
              ),
            ]),
            if (preview!.isEstimate)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Routing service unavailable: straight-line estimate.', style: text.bodySmall),
              ),
          ],
          const SizedBox(height: 14),
          TextField(
            controller: label,
            maxLength: 120,
            decoration: const InputDecoration(labelText: 'Destination name (optional)', hintText: 'e.g. my hostel', counterText: ''),
          ),
          const SizedBox(height: 16),
          Text('Share with *', style: text.titleSmall),
          const SizedBox(height: 4),
          if (contacts.loading && !contacts.loaded)
            const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator())
          else if (contacts.error != null && !contacts.loaded)
            Text(contacts.error!, style: const TextStyle(color: SwColors.primary))
          else if (contacts.contacts.isEmpty)
            Row(children: [
              const Expanded(child: Text('Add a trusted contact before starting.')),
              TextButton(onPressed: () => context.push('/contacts/new'), child: const Text('Add contact')),
            ])
          else
            for (final c in contacts.contacts)
              CheckboxListTile(
                value: selected.contains(c.id),
                onChanged: (_) => onToggle(c.id),
                title: Text(c.name),
                subtitle: Text(c.channels.join(' · '), style: text.bodySmall),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                dense: true,
              ),
          const SizedBox(height: 12),
          FilledButton(onPressed: onStart, child: Text(starting ? 'Starting…' : 'Start journey')),
        ]),
      ),
    );
  }
}
