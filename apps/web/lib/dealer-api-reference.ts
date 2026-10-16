export type DealerApiGroup = 'catalog' | 'orders' | 'payments' | 'after-sales';

export interface DealerApiField {
  name: string;
  type: string;
  required: boolean;
  location: 'path' | 'query' | 'body' | 'file';
  description: string;
}

export interface DealerApiEndpoint {
  id: string;
  group: DealerApiGroup;
  method: 'GET' | 'POST';
  path: string;
  title: string;
  description: string;
  scope: string;
  successStatus: number;
  idempotency?: boolean;
  fields?: readonly DealerApiField[];
  requestBody?: Record<string, unknown>;
  /** Illustrative JSON excerpts, including the real HTTP response envelope. */
  responseExample: unknown;
  notes?: readonly string[];
}

const orderIdField: DealerApiField = {
  name: 'id',
  type: 'UUID',
  required: true,
  location: 'path',
  description:
    'UUID đơn hàng lấy từ data.order.id khi tạo đơn hoặc data.items[].id khi đọc danh sách.',
};
const caseIdField: DealerApiField = {
  name: 'id',
  type: 'UUID',
  required: true,
  location: 'path',
  description: 'UUID yêu cầu hậu mãi từ data.id; không dùng requestNumber.',
};
const pageFields: readonly DealerApiField[] = [
  {
    name: 'page',
    type: 'integer',
    required: false,
    location: 'query',
    description: 'Trang từ 1; mặc định 1.',
  },
  {
    name: 'pageSize',
    type: 'integer',
    required: false,
    location: 'query',
    description: 'Từ 1 đến 100; mặc định 20.',
  },
  {
    name: 'q',
    type: 'string',
    required: false,
    location: 'query',
    description: 'Từ khóa tối đa 128 ký tự.',
  },
];
const reasonField: DealerApiField = {
  name: 'reason',
  type: 'string',
  required: true,
  location: 'body',
  description: 'Lý do từ 5 đến 500 ký tự, sau khi bỏ khoảng trắng đầu/cuối.',
};
const uploadField: DealerApiField = {
  name: 'file',
  type: 'binary',
  required: true,
  location: 'file',
  description:
    'Một tệp JPEG, PNG, WebP hoặc PDF, tối đa 10 MiB (10.485.760 byte). Dùng multipart/form-data; không gửi đường dẫn tệp bằng JSON.',
};
const selectionFields: readonly DealerApiField[] = [
  {
    name: 'inventoryUnitId',
    type: 'UUID',
    required: true,
    location: 'body',
    description:
      'Lấy nguyên inventoryUnitId của một máy từ GET /dealer/catalog; không dùng productId, SKU hay inventoryCode.',
  },
  {
    name: 'shippingAddress',
    type: 'object',
    required: true,
    location: 'body',
    description: 'Địa chỉ giao hàng; gồm đủ các trường con bắt buộc bên dưới.',
  },
  {
    name: 'shippingAddress.receiverName',
    type: 'string',
    required: true,
    location: 'body',
    description: 'Tên người nhận, 1–255 ký tự.',
  },
  {
    name: 'shippingAddress.phone',
    type: 'string',
    required: true,
    location: 'body',
    description: 'Điện thoại người nhận, 8–32 ký tự.',
  },
  {
    name: 'shippingAddress.addressLine',
    type: 'string',
    required: true,
    location: 'body',
    description: 'Số nhà, tên đường, 1–500 ký tự.',
  },
  {
    name: 'shippingAddress.ward',
    type: 'string',
    required: true,
    location: 'body',
    description: 'Phường/xã, 1–255 ký tự.',
  },
  {
    name: 'shippingAddress.district',
    type: 'string',
    required: true,
    location: 'body',
    description: 'Quận/huyện, 1–255 ký tự; API hiện vẫn yêu cầu trường này.',
  },
  {
    name: 'shippingAddress.province',
    type: 'string',
    required: true,
    location: 'body',
    description:
      'Tỉnh/thành, 1–255 ký tự. Phải thuộc vùng đã cấu hình hoặc có shippingQuoteId hợp lệ.',
  },
  {
    name: 'shippingAddress.postalCode',
    type: 'string',
    required: false,
    location: 'body',
    description: 'Mã bưu chính, tối đa 32 ký tự.',
  },
  {
    name: 'shippingQuoteId',
    type: 'UUID',
    required: false,
    location: 'body',
    description:
      'Báo phí riêng do rePhone cấp, còn hạn và khớp đại lý/địa chỉ. Nếu có, gửi cùng mã ở preview và tạo đơn.',
  },
];
const selectionBody = {
  inventoryUnitId: '<inventoryUnitId từ catalog>',
  shippingAddress: {
    receiverName: 'Khách thử nghiệm',
    phone: '0900000000',
    addressLine: '1 Nguyễn Huệ',
    ward: 'Bến Nghé',
    district: 'Quận 1',
    province: 'TP. Hồ Chí Minh',
  },
};
const orderExcerpt = {
  id: '<UUID đơn hàng>',
  orderNumber: 'RPH-20261015-12345678',
  externalOrderId: 'SHOP-ORDER-0001',
  resourceVersion: 1,
  status: 'PLACED',
  fulfillmentStatus: 'PENDING',
  paymentStatus: 'UNPAID',
  dealerPrice: '9500000',
  shippingFee: '30000',
  grandTotal: '9530000',
  balanceDue: '9530000',
  fullyFunded: false,
  items: [{ id: '<UUID dòng hàng>', inventoryUnitId: '<UUID máy>', productName: 'iPhone 13' }],
  paymentRequests: [],
};
const afterSalesExcerpt = {
  id: '<UUID yêu cầu hậu mãi>',
  requestNumber: '<mã yêu cầu hậu mãi>',
  type: 'WARRANTY',
  status: 'REQUESTED',
  orderItem: { id: '<UUID dòng hàng>', productName: 'iPhone 13' },
  issueDescription: 'Máy không nhận sạc sau khi kiểm tra bằng bộ sạc khác.',
  attachments: [],
  availableActions: ['UPLOAD_ATTACHMENT', 'CANCEL'],
};

/** Public server-to-server commerce endpoints; excludes portal and backoffice administration. */
export const DEALER_API_ENDPOINTS: readonly DealerApiEndpoint[] = [
  {
    id: 'catalog-list',
    group: 'catalog',
    method: 'GET',
    path: '/dealer/catalog',
    title: 'Lấy danh sách máy và giá đại lý',
    description:
      'Đọc các máy iPhone hiện đủ điều kiện bán qua kênh đại lý. Lấy inventoryUnitId để dùng ở bước xem lại giá và tạo đơn.',
    scope: 'catalog:read',
    successStatus: 200,
    fields: [
      ...pageFields,
      {
        name: 'sort',
        type: 'newest | price-asc | price-desc',
        required: false,
        location: 'query',
        description: 'Thứ tự sắp xếp; mặc định newest.',
      },
      {
        name: 'condition',
        type: 'A | B | C',
        required: false,
        location: 'query',
        description: 'Lọc hạng ngoại hình; bỏ tham số để lấy mọi hạng.',
      },
    ],
    responseExample: {
      data: {
        items: [
          {
            inventoryUnitId: '<UUID máy>',
            inventoryCode: 'IP13-MID-001',
            productName: 'iPhone 13',
            variantName: '128GB · Midnight',
            dealerPrice: '9500000',
            publicReferencePrice: '10000000',
            warrantyDays: 90,
          },
        ],
        page: 1,
        pageSize: 20,
        revision: 12,
        hasMore: false,
      },
    },
    notes: [
      'q tìm theo tên máy, tên phiên bản, SKU và mã máy.',
      'Đọc tiếp page + 1 khi hasMore = true. revision là số phiên bản kho, không phải mã máy.',
      'Danh sách rỗng có thể do hết máy đủ điều kiện hoặc kênh giá đại lý chưa mở. Liên hệ rePhone nếu vừa được cấp tài khoản.',
      'Đọc kho không giữ máy. Tiền là chuỗi số nguyên VND; đại lý tự lưu giá bán lẻ cho khách.',
    ],
  },
  {
    id: 'orders-preview',
    group: 'orders',
    method: 'POST',
    path: '/dealer/orders/preview',
    title: 'Xem lại giá và phí giao trước khi đặt',
    description:
      'Tính giá và phí giao của một máy tới địa chỉ khách; trả previewFingerprint để gửi nguyên vẹn khi tạo đơn.',
    scope: 'orders:write',
    successStatus: 200,
    fields: selectionFields,
    requestBody: selectionBody,
    responseExample: {
      data: {
        inventoryUnitId: '<UUID máy>',
        dealerPrice: '9500000',
        shippingFee: '30000',
        grandTotal: '9530000',
        previewFingerprint: '<64 ký tự hex từ API>',
        pricingPolicyVersion: 3,
        addressFingerprint: '<64 ký tự hex từ API>',
        shippingQuoteId: null,
        holdsInventory: false,
      },
    },
    notes: [
      'Preview chưa giữ máy. Chỉ tạo đơn thành công mới giữ máy.',
      'Không tự tạo previewFingerprint hoặc dùng fingerprint của giỏ hàng bán lẻ.',
      '409 CHECKOUT_REVIEW_REQUIRED có thể do địa chỉ cần báo phí riêng. Liên hệ rePhone lấy shippingQuoteId cho đúng địa chỉ.',
    ],
  },
  {
    id: 'orders-create',
    group: 'orders',
    method: 'POST',
    path: '/dealer/orders',
    title: 'Tạo đơn và giữ một máy',
    description:
      'Tạo một đơn gồm đúng một máy đã preview; rePhone tự xác định giá và nhận diện đại lý từ khóa API.',
    scope: 'orders:write',
    successStatus: 201,
    idempotency: true,
    fields: [
      ...selectionFields,
      {
        name: 'externalOrderId',
        type: 'string',
        required: true,
        location: 'body',
        description:
          'Mã đơn trong hệ thống của bạn, 1–128 ký tự; riêng biệt cho từng đơn của cùng đại lý.',
      },
      {
        name: 'previewFingerprint',
        type: 'string',
        required: true,
        location: 'body',
        description: 'Đúng 64 ký tự hex chữ thường trả từ preview gần nhất cho máy và địa chỉ này.',
      },
      {
        name: 'contact',
        type: 'object',
        required: true,
        location: 'body',
        description: 'Thông tin liên hệ khách hàng; gồm đủ các trường con bên dưới.',
      },
      {
        name: 'contact.fullName',
        type: 'string',
        required: true,
        location: 'body',
        description: 'Họ tên khách, 1–255 ký tự.',
      },
      {
        name: 'contact.email',
        type: 'email',
        required: true,
        location: 'body',
        description: 'Email hợp lệ, tối đa 320 ký tự.',
      },
      {
        name: 'contact.phone',
        type: 'string',
        required: true,
        location: 'body',
        description: 'Điện thoại liên hệ, 8–32 ký tự.',
      },
      {
        name: 'note',
        type: 'string',
        required: false,
        location: 'body',
        description: 'Ghi chú, tối đa 1.000 ký tự.',
      },
      {
        name: 'linkedOriginalOrderId',
        type: 'UUID',
        required: false,
        location: 'body',
        description: 'UUID đơn đại lý gốc nếu cần liên kết; phải thuộc chính đại lý của bạn.',
      },
    ],
    requestBody: {
      ...selectionBody,
      previewFingerprint: '<previewFingerprint vừa nhận>',
      externalOrderId: 'SHOP-ORDER-0001',
      contact: { fullName: 'Khách thử nghiệm', email: 'buyer@example.test', phone: '0900000000' },
    },
    responseExample: { data: { order: orderExcerpt, replayed: false } },
    notes: [
      'Bắt buộc Idempotency-Key: 16–128 ký tự ASCII hiển thị được, không có khoảng trắng. Tạo một key mới cho mỗi lệnh mới; lưu key và JSON trước khi gửi.',
      'Timeout: gửi lại đúng key và JSON đã lưu. Thành công khi gửi lại trả replayed: true và vẫn HTTP 201.',
      'Cùng key nhưng nội dung khác, hoặc tái sử dụng externalOrderId cho nội dung khác: 409 CONCURRENT_MODIFICATION.',
      'Giữ inventoryUnitId, địa chỉ và shippingQuoteId khớp preview. Nếu giá/chính sách đổi, preview lại rồi xác nhận trước khi gửi lệnh mới.',
      'Lưu data.order.id để đọc đơn; orderNumber và externalOrderId không thay thế UUID trong URL.',
      'Đọc lại yêu cầu thanh toán ngay sau khi tạo. Hạn nộp chứng từ nằm trong submissionDeadlineAt/dueAt, không cố định trên client.',
    ],
  },
  {
    id: 'orders-list',
    group: 'orders',
    method: 'GET',
    path: '/dealer/orders',
    title: 'Lấy danh sách đơn của bạn',
    description:
      'Tra cứu các đơn đại lý của tài khoản sở hữu khóa API, gồm trạng thái đơn, giao hàng và thanh toán.',
    scope: 'orders:read',
    successStatus: 200,
    fields: pageFields,
    responseExample: { data: { items: [orderExcerpt], total: 1, page: 1, pageSize: 20 } },
    notes: [
      'q tìm theo orderNumber hoặc externalOrderId.',
      'Phân trang nằm trong data, không có meta.pagination. Đọc tiếp khi page × pageSize < total.',
      'Muốn đọc paymentRequests và refunds trong đơn, khóa cần thêm payments:read; nếu thiếu, hai mảng này rỗng.',
    ],
  },
  {
    id: 'orders-get',
    group: 'orders',
    method: 'GET',
    path: '/dealer/orders/{id}',
    title: 'Đọc chi tiết và trạng thái đơn',
    description:
      'Lấy trạng thái mới nhất; có thể dùng để đồng bộ lại sau webhook hoặc kiểm tra kết quả khi mất kết nối.',
    scope: 'orders:read',
    successStatus: 200,
    fields: [orderIdField],
    responseExample: { data: orderExcerpt },
    notes: [
      'Chỉ đọc được đơn của chính đại lý. UUID không tồn tại hoặc không thuộc bạn trả ORDER_NOT_FOUND.',
      'Khóa cần thêm payments:read để thấy các mảng paymentRequests và refunds.',
      'Đọc riêng status, fulfillmentStatus và paymentStatus. Đã gửi chứng từ không đồng nghĩa đã trả đủ tiền; kiểm tra fullyFunded và trạng thái mới nhất.',
    ],
  },
  {
    id: 'orders-cancel',
    group: 'orders',
    method: 'POST',
    path: '/dealer/orders/{id}/cancel',
    title: 'Hủy đơn khi còn đủ điều kiện',
    description:
      'Yêu cầu hủy đơn và giải phóng máy. Nếu đã nhận tiền, khoản hoàn được xử lý riêng.',
    scope: 'orders:write',
    successStatus: 200,
    fields: [orderIdField, reasonField],
    requestBody: { reason: 'Khách yêu cầu hủy đơn trước khi giao hàng.' },
    responseExample: { data: { id: '<UUID đơn hàng>', status: 'CANCELLED' } },
    notes: [
      'Không hủy được sau khi đã bàn giao hãng vận chuyển. Các tình huống không cho phép hủy trả 409 INVALID_STATE_TRANSITION.',
      'Đơn giao hoàn có thể cần rePhone chốt trách nhiệm và phí trước khi hủy. Theo dõi tiền hoàn qua GET /dealer/refunds.',
    ],
  },
  {
    id: 'payments-list',
    group: 'payments',
    method: 'GET',
    path: '/dealer/orders/{id}/payment-requests',
    title: 'Lấy thông tin chuyển khoản cho đơn',
    description:
      'Đọc số tiền, hạn thanh toán, nội dung chuyển khoản và tài khoản ngân hàng rePhone của từng yêu cầu thanh toán.',
    scope: 'payments:read',
    successStatus: 200,
    fields: [orderIdField],
    responseExample: {
      data: [
        {
          id: '<UUID yêu cầu thanh toán>',
          purpose: 'FULL_PAYMENT',
          requiredAmount: '9530000',
          dueAt: '2026-10-15T10:30:00.000Z',
          status: 'OPEN',
          transferContent: '<nội dung chuyển khoản từ API>',
          bank: {
            bankName: '<ngân hàng từ API>',
            bankAccountNumber: '<số tài khoản từ API>',
            bankAccountHolder: '<chủ tài khoản từ API>',
          },
          proofs: [],
        },
      ],
    },
    notes: [
      'Dùng id của yêu cầu thanh toán khi tải chứng từ, không dùng UUID đơn hàng.',
      'Chỉ chuyển khoản theo yêu cầu còn OPEN, đúng requiredAmount, transferContent và bank trả về; dùng dữ liệu mới nhất nếu có yêu cầu BALANCE.',
      'Thông tin này là giao dịch đại lý với rePhone. Khách mua lẻ thanh toán cho cửa hàng của bạn.',
      'API này trả thông tin ngân hàng; không có trường URL ảnh QR trong hợp đồng hiện tại.',
    ],
  },
  {
    id: 'payments-proof',
    group: 'payments',
    method: 'POST',
    path: '/dealer/payment-requests/{id}/proofs',
    title: 'Nộp chứng từ chuyển khoản',
    description:
      'Tải một ảnh hoặc PDF làm chứng từ cho yêu cầu thanh toán đang mở, trước thời hạn.',
    scope: 'payments:write',
    successStatus: 201,
    fields: [
      {
        name: 'id',
        type: 'UUID',
        required: true,
        location: 'path',
        description:
          'UUID yêu cầu thanh toán lấy từ GET /dealer/orders/{id}/payment-requests; khác UUID đơn.',
      },
      uploadField,
    ],
    responseExample: {
      data: {
        id: '<UUID chứng từ>',
        status: 'UNDER_REVIEW',
        submittedAt: '2026-10-15T10:00:00.000Z',
        replayed: false,
      },
    },
    notes: [
      'Để cURL tự đặt Content-Type kèm boundary cho multipart; không tự đặt application/json.',
      'Nộp chứng từ chỉ đưa vào UNDER_REVIEW; rePhone phải đối chiếu khoản tiền thực nhận trước khi xác nhận.',
      'Cùng nội dung tệp đã nộp cho chính yêu cầu này và chưa bị từ chối có thể trả replayed: true. Tệp từng bị từ chối hoặc dùng cho yêu cầu khác bị từ chối.',
      'Hạn mức riêng: 5 lần/10 phút, dùng chung với tải tệp hậu mãi của cùng đại lý.',
    ],
  },
  {
    id: 'refunds-list',
    group: 'payments',
    method: 'GET',
    path: '/dealer/refunds',
    title: 'Theo dõi khoản hoàn tiền',
    description:
      'Đọc tối đa 100 khoản hoàn gần nhất của đại lý; tiền hoàn về tài khoản đại lý đã xác minh.',
    scope: 'payments:read',
    successStatus: 200,
    responseExample: {
      data: [
        {
          id: '<UUID khoản hoàn>',
          orderId: '<UUID đơn hàng>',
          amount: '9530000',
          status: 'REQUESTED',
          reason: 'Hoàn tiền đơn đã hủy.',
          payoutHold: false,
          completedAt: null,
        },
      ],
    },
    notes: [
      'Endpoint này không nhận page/pageSize và trả mảng trong data.',
      'Không có endpoint công khai cho đại lý tự xác nhận đã hoàn tiền. Bạn thực hiện hoàn cho khách lẻ theo giao dịch của cửa hàng.',
    ],
  },
  {
    id: 'after-sales-list',
    group: 'after-sales',
    method: 'GET',
    path: '/dealer/after-sales',
    title: 'Lấy danh sách yêu cầu hậu mãi',
    description: 'Đọc tối đa 100 yêu cầu hậu mãi gần nhất, theo thời điểm yêu cầu giảm dần.',
    scope: 'after-sales:read',
    successStatus: 200,
    responseExample: { data: [afterSalesExcerpt] },
    notes: ['Trả mảng trong data; endpoint hiện không nhận bộ lọc hoặc tham số phân trang.'],
  },
  {
    id: 'after-sales-create',
    group: 'after-sales',
    method: 'POST',
    path: '/dealer/after-sales',
    title: 'Tạo yêu cầu bảo hành, trả hoặc đổi',
    description: 'Tạo hậu mãi cho một dòng hàng trong đơn đã hoàn tất của chính đại lý.',
    scope: 'after-sales:write',
    successStatus: 201,
    idempotency: true,
    fields: [
      {
        name: 'orderItemId',
        type: 'UUID',
        required: true,
        location: 'body',
        description: 'Lấy từ items[].id trong chi tiết đơn; không dùng UUID đơn hay UUID máy.',
      },
      {
        name: 'type',
        type: 'WARRANTY | RETURN | EXCHANGE',
        required: true,
        location: 'body',
        description: 'Bảo hành, trả hoặc đổi. WARRANTY yêu cầu bảo hành đang có hiệu lực.',
      },
      {
        name: 'issueDescription',
        type: 'string',
        required: true,
        location: 'body',
        description: 'Mô tả vấn đề, 10–2.000 ký tự.',
      },
      {
        name: 'requestedResolution',
        type: 'string',
        required: false,
        location: 'body',
        description: 'Mong muốn xử lý, 1–500 ký tự nếu có.',
      },
    ],
    requestBody: {
      orderItemId: '<items[].id từ chi tiết đơn>',
      type: 'WARRANTY',
      issueDescription: 'Máy không nhận sạc sau khi kiểm tra bằng bộ sạc khác.',
      requestedResolution: 'Kiểm tra và sửa chữa theo bảo hành.',
    },
    responseExample: { data: afterSalesExcerpt },
    notes: [
      'Bắt buộc Idempotency-Key từ 16–128 ký tự ASCII hiển thị được, không có khoảng trắng. Gửi lại cùng key và JSON khi mất kết nối.',
      'Đơn phải ở trạng thái COMPLETED. Mỗi dòng hàng chỉ có một yêu cầu hậu mãi đang mở.',
      'Lưu data.id để đọc, hủy hoặc thêm tệp. Phản hồi không có trường replayed cho endpoint này.',
    ],
  },
  {
    id: 'after-sales-get',
    group: 'after-sales',
    method: 'GET',
    path: '/dealer/after-sales/{id}',
    title: 'Đọc chi tiết yêu cầu hậu mãi',
    description: 'Xem trạng thái, tiến trình xử lý, kết quả và danh sách tệp đính kèm của yêu cầu.',
    scope: 'after-sales:read',
    successStatus: 200,
    fields: [caseIdField],
    responseExample: { data: afterSalesExcerpt },
    notes: ['availableActions cho biết thao tác hiện được phép: UPLOAD_ATTACHMENT hoặc CANCEL.'],
  },
  {
    id: 'after-sales-cancel',
    group: 'after-sales',
    method: 'POST',
    path: '/dealer/after-sales/{id}/cancel',
    title: 'Hủy yêu cầu hậu mãi chưa tiếp nhận',
    description: 'Hủy yêu cầu khi còn trạng thái REQUESTED.',
    scope: 'after-sales:write',
    successStatus: 200,
    fields: [caseIdField, reasonField],
    requestBody: { reason: 'Khách chưa cần gửi máy kiểm tra nữa.' },
    responseExample: {
      data: {
        ...afterSalesExcerpt,
        status: 'CANCELLED',
        cancelReason: 'Khách chưa cần gửi máy kiểm tra nữa.',
        availableActions: [],
      },
    },
    notes: [
      'Yêu cầu đã tiếp nhận hoặc đang kiểm tra không hủy được bằng endpoint này; trả 409 INVALID_STATE_TRANSITION.',
    ],
  },
  {
    id: 'after-sales-upload',
    group: 'after-sales',
    method: 'POST',
    path: '/dealer/after-sales/{id}/attachments',
    title: 'Thêm ảnh hoặc tài liệu hậu mãi',
    description:
      'Tải từng tệp làm bằng chứng cho yêu cầu đang REQUESTED, RECEIVED hoặc INSPECTING.',
    scope: 'after-sales:write',
    successStatus: 201,
    fields: [caseIdField, uploadField],
    responseExample: {
      data: {
        ...afterSalesExcerpt,
        attachments: [
          {
            id: '<UUID tệp>',
            mimeType: 'image/png',
            fileSize: 204800,
            uploadedAt: '2026-10-15T10:00:00.000Z',
          },
        ],
      },
    },
    notes: [
      'Tối đa 5 tệp cho mỗi yêu cầu; mỗi lần gửi một tệp. Không có chống trùng tệp tự động ở thao tác này.',
      'Hạn mức riêng 5 lần/10 phút, dùng chung với nộp chứng từ thanh toán của cùng đại lý.',
    ],
  },
  {
    id: 'warranties-list',
    group: 'after-sales',
    method: 'GET',
    path: '/dealer/orders/{id}/warranties',
    title: 'Đọc phiếu bảo hành của đơn',
    description:
      'Lấy các phiếu bảo hành đã phát sinh; phản hồi kèm thương hiệu và thông tin hỗ trợ của đại lý.',
    scope: 'after-sales:read',
    successStatus: 200,
    fields: [orderIdField],
    responseExample: {
      data: [
        {
          orderItemId: '<UUID dòng hàng>',
          warrantyCode: '<mã bảo hành>',
          status: 'ACTIVE',
          productName: 'iPhone 13',
          startsAt: '2026-10-15T10:00:00.000Z',
          endsAt: '2027-01-13T10:00:00.000Z',
          seller: '<tên pháp lý đại lý>',
          brandName: '<tên cửa hàng>',
          warrantyOperator: 'rePhone',
        },
      ],
    },
    notes: [
      'Chưa có phiếu bảo hành thì data là mảng rỗng. Đơn mới tạo chưa có phiếu ngay.',
      'Dùng orderItemId khi tạo yêu cầu hậu mãi; không dùng warrantyCode thay UUID dòng hàng.',
    ],
  },
  {
    id: 'after-sales-attachment',
    group: 'after-sales',
    method: 'GET',
    path: '/dealer/after-sales/{id}/attachments/{attachmentId}',
    title: 'Lấy liên kết xem tệp hậu mãi',
    description: 'Lấy URL có chữ ký để xem hoặc tải một tệp riêng tư trong yêu cầu của bạn.',
    scope: 'after-sales:read',
    successStatus: 200,
    fields: [
      caseIdField,
      {
        name: 'attachmentId',
        type: 'UUID',
        required: true,
        location: 'path',
        description: 'Lấy từ attachments[].id trong chi tiết yêu cầu hậu mãi.',
      },
    ],
    responseExample: { data: { url: '<URL tệp riêng tư có chữ ký>' } },
    notes: [
      'URL có hiệu lực 300 giây. Khi hết hạn, gọi lại endpoint để lấy URL mới; không lưu URL làm địa chỉ vĩnh viễn.',
    ],
  },
];

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Bash/WSL examples. The base already ends in /api/v1; braces are placeholders to replace. */
export function dealerEndpointCurl(endpoint: DealerApiEndpoint): string {
  const parts = [
    `curl --globoff --request ${endpoint.method}`,
    `  --url "$REPHONE_API_BASE_URL${endpoint.path}"`,
    '  --header "X-Dealer-Api-Key: $REPHONE_DEALER_KEY"',
  ];
  if (endpoint.idempotency) {
    parts.push('  --header "Idempotency-Key: <unique-key-16-128-characters>"');
  }
  if (endpoint.fields?.some((field) => field.location === 'file')) {
    parts.push('  --form "file=@/path/to/evidence.png;type=image/png"');
  } else if (endpoint.requestBody !== undefined) {
    parts.push('  --header "Content-Type: application/json"');
    parts.push(`  --data-raw ${shellQuote(JSON.stringify(endpoint.requestBody, null, 2))}`);
  }
  return parts.join(' \\\n');
}
