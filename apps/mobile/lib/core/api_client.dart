import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

/// Error returned by the SafeWalk server ({ error: { code, message } }).
class ApiException implements Exception {
  ApiException(this.statusCode, this.code, this.message);

  final int statusCode;
  final String code;
  final String message;

  bool get isNetwork => statusCode == 0;

  @override
  String toString() => message;
}

/// Thin JSON client for the Node server. Every request carries the current
/// Supabase access token; supabase_flutter refreshes it automatically.
class ApiClient {
  ApiClient({http.Client? httpClient, String? Function()? tokenProvider, this.baseUrl = AppConfig.apiUrl})
      : _http = httpClient ?? http.Client(),
        _token = tokenProvider ?? (() => Supabase.instance.client.auth.currentSession?.accessToken);

  final http.Client _http;
  final String? Function() _token;
  final String baseUrl;

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body);
  Future<dynamic> patch(String path, Object body) => _send('PATCH', path, body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'));
    final token = _token();
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    http.Response response;
    try {
      response = await http.Response.fromStream(await _http.send(request).timeout(const Duration(seconds: 20)));
    } catch (_) {
      throw ApiException(0, 'NETWORK', 'Cannot reach SafeWalk. Check your internet connection.');
    }

    final decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode >= 400) {
      final error = decoded is Map ? decoded['error'] as Map? : null;
      throw ApiException(
        response.statusCode,
        (error?['code'] as String?) ?? 'ERROR',
        (error?['message'] as String?) ?? 'Something went wrong (${response.statusCode})',
      );
    }
    return decoded;
  }
}
