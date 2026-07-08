-- Run once on your Azure MySQL database before enabling the API Monitor screen.

CREATE TABLE IF NOT EXISTS api_call_logs (
  id            BIGINT        NOT NULL AUTO_INCREMENT,
  direction     VARCHAR(10)   NOT NULL,
  source        VARCHAR(50)   NULL,
  endpoint      VARCHAR(255)  NOT NULL,
  method        VARCHAR(10)   NOT NULL,
  status_code   INT           NULL,
  request_body  TEXT          NULL,
  response_body TEXT          NULL,
  duration_ms   INT           NULL,
  ip_address    VARCHAR(50)   NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_direction (direction),
  INDEX idx_source    (source),
  INDEX idx_created   (created_at)
) COLLATE=utf8mb4_general_ci;
