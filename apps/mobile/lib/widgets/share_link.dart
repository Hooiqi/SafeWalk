import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import 'common.dart';

/// Shares a tracking link.
///
/// The message is always copied first, so it can be pasted into WhatsApp,
/// Telegram or anywhere else. On a phone the system share sheet then opens as
/// well. In a browser it does not: on a laptop that sheet offers only a few
/// apps and no way to copy, so the copied text is the useful result.
Future<void> shareLink(
  BuildContext context, {
  required String text,
  String? subject,
}) async {
  var copied = false;
  try {
    await Clipboard.setData(ClipboardData(text: text));
    copied = true;
  } catch (_) {
    // Some browsers refuse clipboard access; the share sheet below still works on phones.
  }
  if (!context.mounted) return;
  if (kIsWeb) {
    if (copied) {
      showMessage(
        context,
        'Link copied. Paste it into WhatsApp, Telegram or a text message.',
      );
    } else {
      await _showLink(context, text);
    }
    return;
  }
  if (copied) showMessage(context, 'Link copied. You can also paste it anywhere.');
  await SharePlus.instance.share(ShareParams(text: text, subject: subject));
}

/// Last resort when the browser blocks the clipboard: show the text to select by hand.
Future<void> _showLink(BuildContext context, String text) => showDialog<void>(
  context: context,
  builder: (ctx) => AlertDialog(
    title: const Text('Copy this message'),
    content: SelectableText(text),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(ctx),
        child: const Text('Done'),
      ),
    ],
  ),
);
