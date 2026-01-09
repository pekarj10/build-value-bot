-- Allow min_price and max_price to be nullable for benchmark data that only has avg_price
ALTER TABLE benchmark_prices ALTER COLUMN min_price DROP NOT NULL;
ALTER TABLE benchmark_prices ALTER COLUMN max_price DROP NOT NULL;