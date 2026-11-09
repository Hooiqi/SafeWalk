import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/ids.dart';
import '../../core/theme.dart';
import '../../data/repositories.dart';
import '../../services/location_service.dart';
import '../../widgets/campus_map.dart';
import '../../widgets/common.dart';
import 'incident_ui.dart';

/// Picks a photo; returns the image bytes (JPEG) or null when cancelled.
typedef PhotoPicker = Future<Uint8List?> Function(ImageSource source);

Future<Uint8List?> _pickWithImagePicker(ImageSource source) async {
  // Re-encoded and downsized on the phone; the server also strips metadata.
  final file = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 80);
  return file?.readAsBytes();
}

/// Module 3: submit an incident report (Diagram 12.3: category and severity,
/// pin location, description, optional photo, optional anonymity).
class ReportIncidentScreen extends StatefulWidget {
  const ReportIncidentScreen({super.key, this.pickPhoto = _pickWithImagePicker});
  final PhotoPicker pickPhoto;

  @override
  State<ReportIncidentScreen> createState() => _ReportIncidentScreenState();
}

class _ReportIncidentScreenState extends State<ReportIncidentScreen> {
  final _description = TextEditingController();
  final _map = MapController();
  // One id per report, so a retry after a dropped connection is not a second report.
  final _requestId = uuidV4();

  String? _category;
  String _severity = IncidentSeverity.medium;
  bool _anonymous = false;
  LatLng? _gps;
  double? _accuracy;
  LatLng? _pin;
  bool _pinMoved = false;
  String? _locationNote;
  Uint8List? _photo;
  bool _sending = false;
  bool _tried = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _locate();
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    try {
      final r = await context.read<LocationSource>().current();
      if (!mounted) return;
      setState(() {
        _gps = r.position;
        _accuracy = r.accuracyM;
        if (!_pinMoved) _pin = r.position;
        _locationNote = null;
      });
      try {
        _map.move(r.position, 17);
      } catch (_) {
        // The map is not on screen yet; it opens at the pin.
      }
    } on LocationUnavailable catch (e) {
      if (mounted) setState(() => _locationNote = '${e.message} Tap the map to place the pin yourself.');
    } catch (_) {
      if (mounted) setState(() => _locationNote = 'Could not get your location. Tap the map to place the pin yourself.');
    }
  }

  Future<void> _choosePhoto() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Take a photo'),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from gallery'),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (source == null) return;
    try {
      final bytes = await widget.pickPhoto(source);
      if (bytes != null && mounted) setState(() => _photo = bytes);
    } catch (_) {
      if (mounted) showMessage(context, 'Could not open the photo. Check camera or photo access in Settings.');
    }
  }

  String? get _problem {
    if (_category == null) return 'Choose what happened.';
    if (_description.text.trim().isEmpty) return 'Describe what happened.';
    if (_pin == null) return 'Tap the map to show where it happened.';
    return null;
  }

  Future<void> _send() async {
    setState(() {
      _tried = true;
      _error = null;
    });
    if (_problem != null) return;
    setState(() => _sending = true);
    final repo = context.read<IncidentsRepository>();
    try {
      final report = await repo.submit(
        category: _category!,
        severity: _severity,
        description: _description.text,
        location: _pin!,
        anonymous: _anonymous,
        requestId: _requestId,
        // GPS accuracy only describes the pin when the pin is the GPS fix.
        accuracyM: _pinMoved ? null : _accuracy,
      );
      String message = report.status == IncidentStatus.verified
          ? 'Report sent. It matches other reports nearby and is now on the safety map.'
          : 'Report sent. USM Security will review it; follow it in My reports.';
      if (_photo != null) {
        try {
          await repo.attachPhoto(report.id, _photo!);
        } on ApiException catch (e) {
          message = 'Report sent, but the photo was not: ${e.message}';
        }
      }
      if (!mounted) return;
      showMessage(context, message);
      context.pushReplacement('/incidents/mine');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final problem = _tried ? _problem : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Report an incident')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 32), children: [
          Text(
            'In danger right now? Use SOS instead. Reports are reviewed by USM Security before they appear on the safety map.',
            style: text.bodySmall,
          ),
          const SizedBox(height: 20),

          Text('What happened? *', style: text.titleSmall),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final c in IncidentCategory.all)
              ChoiceChip(
                avatar: Icon(categoryIcon(c), size: 18, color: _category == c ? SwColors.onAccent : SwColors.text2),
                label: Text(categoryLabel(c)),
                selected: _category == c,
                showCheckmark: false,
                onSelected: (_) => setState(() => _category = c),
              ),
          ]),
          if (_category != null) ...[
            const SizedBox(height: 8),
            Text(categoryHint(_category!), style: text.bodySmall),
          ],
          const SizedBox(height: 22),

          Text('How serious is it?', style: text.titleSmall),
          const SizedBox(height: 10),
          SegmentedButton<String>(
            showSelectedIcon: false,
            segments: [
              for (final s in IncidentSeverity.all)
                ButtonSegment(value: s, icon: Icon(severityIcon(s), color: severityColor(s)), label: Text(severityLabel(s))),
            ],
            selected: {_severity},
            onSelectionChanged: (v) => setState(() => _severity = v.first),
          ),
          const SizedBox(height: 8),
          Text(severityHint(_severity), style: text.bodySmall),
          const SizedBox(height: 22),

          TextField(
            controller: _description,
            maxLength: 1000,
            minLines: 3,
            maxLines: 6,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Describe what happened *',
              hintText: 'What you saw, and when. Leave out names of people involved.',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 14),

          Text('Where? *', style: text.titleSmall),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(SwRadius.inner),
            child: SizedBox(
              height: 220,
              child: CampusMap(
                controller: _map,
                myPosition: _gps,
                initialCenter: _pin,
                initialZoom: 17,
                onTap: (p) => setState(() {
                  _pin = p;
                  _pinMoved = true;
                }),
                markers: [
                  if (_pin != null)
                    Marker(
                      point: _pin!,
                      width: 40,
                      height: 40,
                      alignment: Alignment.topCenter,
                      child: const Icon(Icons.location_on_rounded, size: 40, color: SwColors.text, semanticLabel: 'Report location'),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _locationNote ??
                (_pin == null
                    ? 'Finding your location…'
                    : _pinMoved
                        ? 'Pin placed on the map. Tap again to move it.'
                        : 'Using your current location. Tap the map if it happened somewhere else.'),
            style: text.bodySmall?.copyWith(color: _locationNote != null ? SwColors.secondary : null),
          ),
          const SizedBox(height: 14),

          Card(
            child: SwitchListTile(
              value: _anonymous,
              onChanged: (v) => setState(() => _anonymous = v),
              title: const Text('Report anonymously', style: TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(
                'USM Security will not see your name. You can still follow the report in My reports.',
                style: text.bodySmall,
              ),
            ),
          ),
          const SizedBox(height: 14),

          if (_photo == null)
            OutlinedButton.icon(
              onPressed: _choosePhoto,
              icon: const Icon(Icons.add_a_photo_outlined),
              label: const Text('Add a photo (optional)'),
            )
          else
            Row(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(SwRadius.inner),
                child: Image.memory(_photo!, width: 96, height: 96, fit: BoxFit.cover, semanticLabel: 'Photo to attach'),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text('Only USM Security can see the photo. Location data inside it is removed.', style: text.bodySmall),
              ),
              IconButton(
                tooltip: 'Remove photo',
                onPressed: () => setState(() => _photo = null),
                icon: const Icon(Icons.close_rounded),
              ),
            ]),
          const SizedBox(height: 22),

          if (problem != null) ...[
            Text(problem, style: const TextStyle(color: SwColors.error)),
            const SizedBox(height: 10),
          ],
          if (_error != null) ...[
            Text(_error!, style: const TextStyle(color: SwColors.error)),
            const SizedBox(height: 10),
          ],
          FilledButton(onPressed: _sending ? null : _send, child: Text(_sending ? 'Sending…' : 'Send report')),
        ]),
      ),
    );
  }
}
