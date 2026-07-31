# Security baseline

The service processes untrusted documents and images. OCR endpoints remain disabled until all mandatory gates are implemented and tested.

Mandatory gates:

- file signature, MIME, and extension validation;
- PDF page, upload byte, image pixel, CPU, memory, and time limits;
- random server-side names and isolated per-job temporary directories;
- non-root container execution;
- no shell interpolation for external tools;
- cleanup on success, failure, cancellation, and timeout;
- bounded concurrency and queue size;
- result schema validation;
- calibrated confidence and anomaly detection;
- mandatory teacher review before student delivery.

No secrets, source documents, OCR crops, or result payloads may be written to logs.
