"""Keel runner: checks Box folders against natural-language rules on every change.

Every module here is written against a small port (Box API, queue, store, judge) so the local
stand-ins can be swapped for Box, SQS FIFO, DynamoDB and Bedrock without touching run logic.
"""
