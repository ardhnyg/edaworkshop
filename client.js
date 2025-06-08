const { Kafka } = require('@confluentinc/kafka-javascript').KafkaJS;
const { SchemaRegistryClient, SerdeType, AvroSerializer, AvroDeserializer} = require('@confluentinc/schemaregistry');

const registry = new SchemaRegistryClient({ baseURLs: ['SR_Endpoint'], basicAuthCredentials: {
	credentialsSource: 'SASL_INHERIT',
	sasl: {
		mechanism: 'PLAIN',
		username: 'SR_API_Key',
		password: 'SR_API_Secret'
	}
}
})
const kafka = new Kafka({
  kafkaJS: {
    brokers: ['Cluster_Endpoint'],
	  ssl: true,
	  sasl: {
		mechanism: 'plain',
		username: 'Cluster_API_Key',
		password: 'Cluster_API_Secret'
	  }
	  
  }
});

let consumer = kafka.consumer({
  kafkaJS: {
    groupId: "test-group",
    fromBeginning: true,
  },
});
let producer = kafka.producer();

const schema = {
  type: 'record',
  namespace: 'com.siloam',
  name: 'patient',
  fields: [
    { name: 'patient_id', type: 'int' },
    { name: 'nama', type: 'string' },
    { name: 'doctor_id', type: 'int' },
    { name: 'is_asuransi', type: 'string' }
  ],
};

const topicName = 'patients_admission';
const subjectName = topicName + '-value';

const run = async () => {
  // Register schema
  const id = await registry.register(
    subjectName,
    {
      schemaType: 'AVRO',
      schema: JSON.stringify(schema)
    }
  )

  // Create an Avro serializer
  const ser = new AvroSerializer(registry, SerdeType.VALUE, { useLatestVersion: true });

  // Produce a message with the schema
  await producer.connect()
  const outgoingMessage = {
    value: await ser.serialize(topicName, { patient_id: 001, nama: 'kafka', doctor_id: 0012, is_asuransi: 'true' }),
  }
  await producer.send({
    topic: topicName,
    messages: [outgoingMessage]
  });
  console.log("Producer sent its message.")
  await producer.disconnect();
  producer = null;

  // Create an Avro deserializer
  const deser = new AvroDeserializer(registry, SerdeType.VALUE, {});

  await consumer.connect()
  await consumer.subscribe({ topic: topicName })

  let messageRcvd = false;
  await consumer.run({
    eachMessage: async ({ message }) => {
      const decodedMessage = {
        ...message,
        value: await deser.deserialize(topicName, message.value)
      };
      console.log("Consumer received message.\nBefore decoding: " + JSON.stringify(message) + "\nAfter decoding: " + JSON.stringify(decodedMessage));
      messageRcvd = true;
    },
  });

  // Wait around until we get a message, and then disconnect.
  while (!messageRcvd) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await consumer.disconnect();
  consumer = null;
}

run().catch (async e => {
  console.error(e);
  consumer && await consumer.disconnect();
  producer && await producer.disconnect();
  process.exit(1);
})
