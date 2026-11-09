import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../core/config.dart';
import '../core/constants.dart';

class RealtimeEvent {
  const RealtimeEvent(this.name, this.data);
  final String name;
  final Map<String, dynamic> data;
}

/// Minimal interface the trip tracker needs from the real-time channel.
abstract class RealtimeChannel {
  ValueListenable<bool> get connected;
  Stream<RealtimeEvent> get events;

  /// Sends a GPS sample (trip or SOS) and waits for the server's acknowledgement.
  /// Returns the server's error code ('OFFLINE' when not connected), or null on success.
  Future<String?> send(String event, Map<String, dynamic> payload);
}

/// Socket.io connection for the signed-in user. The server assigns rooms after
/// verifying the Supabase token; a fresh token is supplied on each reconnect.
class RealtimeService implements RealtimeChannel {
  RealtimeService({required String? Function() tokenProvider}) : _token = tokenProvider;

  final String? Function() _token;
  final _connected = ValueNotifier<bool>(false);
  final _events = StreamController<RealtimeEvent>.broadcast();
  final _seen = <String>{};
  io.Socket? _socket;

  @override
  ValueListenable<bool> get connected => _connected;
  @override
  Stream<RealtimeEvent> get events => _events.stream;

  void connect() {
    if (_socket != null) return;
    final socket = io.io(
      AppConfig.apiUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuthFn((cb) => cb({'token': _token() ?? ''}))
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(10000)
          .disableAutoConnect()
          .build(),
    );
    socket
      ..onConnect((_) => _connected.value = true)
      ..onDisconnect((_) => _connected.value = false)
      ..onConnectError((_) => _connected.value = false)
      ..on(SocketEvents.authExpired, (_) => socket.disconnect().connect());

    for (final name in [SocketEvents.tripStatus, SocketEvents.tripGracePrompt, SocketEvents.tripSignal, SocketEvents.alertStatus]) {
      socket.on(name, (data) {
        if (data is! Map) return;
        final map = Map<String, dynamic>.from(data);
        final id = map['event_id'] as String?;
        if (id != null && !_seen.add(id)) return; // duplicate after reconnect
        if (_seen.length > 500) _seen.remove(_seen.first);
        _events.add(RealtimeEvent(name, map));
      });
    }
    _socket = socket..connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _connected.value = false;
  }

  @override
  Future<String?> send(String event, Map<String, dynamic> payload) async {
    final socket = _socket;
    if (socket == null || !_connected.value) return 'OFFLINE';
    try {
      final ack = await socket
          .emitWithAckAsync(event, payload)
          .timeout(const Duration(seconds: 8));
      if (ack is Map && ack['ok'] == true) return null;
      return ack is Map ? (ack['error'] as String? ?? 'ERROR') : 'ERROR';
    } on TimeoutException {
      return 'OFFLINE';
    }
  }
}
