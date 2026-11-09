import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme.dart';

/// Hold-to-confirm SOS button (proposal Module 2): the action only fires after
/// the button has been held for [holdDuration]; releasing early cancels, which
/// prevents accidental activation. A ring fills while holding.
class HoldToConfirmButton extends StatefulWidget {
  const HoldToConfirmButton({
    super.key,
    required this.onConfirmed,
    required this.holdDuration,
    this.label = 'SOS',
    this.hint = 'Hold for 3 seconds',
    this.haptics = true,
    this.enabled = true,
    this.size = 220,
  });

  final VoidCallback onConfirmed;
  final Duration holdDuration;
  final String label;
  final String hint;
  final bool haptics;
  final bool enabled;
  final double size;

  @override
  State<HoldToConfirmButton> createState() => _HoldToConfirmButtonState();
}

class _HoldToConfirmButtonState extends State<HoldToConfirmButton> with SingleTickerProviderStateMixin {
  late final AnimationController _progress = AnimationController(vsync: this, duration: widget.holdDuration)
    ..addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        if (widget.haptics) HapticFeedback.heavyImpact();
        widget.onConfirmed();
        _progress.reset();
      }
    });
  int _lastSecond = 0;

  @override
  void initState() {
    super.initState();
    _progress.addListener(() {
      // A light tick each second so the user can feel the countdown.
      final second = (_progress.value * widget.holdDuration.inSeconds).floor();
      if (widget.haptics && second > _lastSecond) HapticFeedback.selectionClick();
      _lastSecond = second;
    });
  }

  @override
  void dispose() {
    _progress.dispose();
    super.dispose();
  }

  void _start() {
    if (!widget.enabled) return;
    _lastSecond = 0;
    _progress.forward(from: 0);
  }

  void _cancel() {
    if (_progress.isAnimating) _progress.animateBack(0, duration: const Duration(milliseconds: 200));
  }

  @override
  Widget build(BuildContext context) {
    final colour = widget.enabled ? SwColors.alert : SwColors.surfaceRaised;
    return Semantics(
      button: true,
      enabled: widget.enabled,
      label: '${widget.label}. ${widget.hint} to send.',
      child: GestureDetector(
        onTapDown: (_) => _start(),
        onTapUp: (_) => _cancel(),
        onTapCancel: _cancel,
        child: SizedBox.square(
          dimension: widget.size,
          child: AnimatedBuilder(
            animation: _progress,
            builder: (context, _) {
              final remaining = (widget.holdDuration.inMilliseconds * (1 - _progress.value) / 1000).ceil();
              return Stack(alignment: Alignment.center, children: [
                SizedBox.expand(
                  child: CircularProgressIndicator(
                    value: _progress.value,
                    strokeWidth: 8,
                    color: SwColors.text,
                    backgroundColor: SwColors.border,
                  ),
                ),
                Container(
                  width: widget.size - 28,
                  height: widget.size - 28,
                  decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
                  alignment: Alignment.center,
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(widget.label,
                        style: const TextStyle(color: SwColors.onAccent, fontFamily: 'WixMadeforDisplay', fontSize: 44, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(
                      _progress.value > 0 ? 'Keep holding… $remaining' : widget.hint,
                      style: const TextStyle(color: SwColors.onAccent, fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                  ]),
                ),
              ]);
            },
          ),
        ),
      ),
    );
  }
}
