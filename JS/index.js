jQuery(document).ready(function($) {

	var Page = {
		PM_PAGE: 4,							/*物理页面数，共4*/
    VM_PAGE: 32,            /*虚页面数，共32*/
		INSTR_PER_PAGE: 10,			/*每页指令数*/
    TOTAL_INSTR: 320,       /*指令条数，320*/
		OPT: 1,									/*最佳算法*/
		FIFO: 2,								/*先进先出算法*/
		LRU: 3									/*最近很少使用算法*/
	};
	/*pageTable      页表，总数为VM_PAGE*/
	/*ppageBitmap    物理页位图，存放当前正在物理内存中的页表项的指针*/
	/*instrArray     指令数组*/
	/*pfailNum       缺页数*/
	/*curReplaceAlg 当前置换算法，默认为OPT*/
	var pageTable = [],
      ppageBitmap = [],
      instrArray = [],
    	pfailNum = 0,
    	curReplaceAlg = 1;

	/**
	 * 页表项数据结构
	 * @param {int} vmn   虚页号
	 * @param {int} pmn   虚页号所对应的实页号
	 * @param {int} exist 存在位，是否已经在物理内存中
	 * @param {int} time  最近访问时间，LRU中用于统计最近访问时间
	 *                    FIFO中用于统计第一次进入物理内存时间
	 */
	function VageItem(vmn, pmn, exist, time) {
		this.vmn = vmn;
		this.pmn = pmn;
		this.exist = exist;
		this.time = time;
	}

	/**
	 * 每条指令信息
	 * @param {int} num    指令号
	 * @param {int} vpage  所属虚页
	 * @param {int} offset 页内偏移
	 * @param {int} inflow 指令流中是否已包含该指令，用于构建指令流
	 */
	function InstrItem(num, vpage, offset, inflow) {
		this.num = num; 
		this.vpage = vpage; 
		this.offset = offset; 
		this.inflow = inflow; 
	}

	/**
	 * 指令流数据结构
	 */
	function InstrFlow() {
		this.instr = null;
		this.next = null;
	}
	/**
	 * 指令流头数据结构
	 */
	function InstrFlowHead() {
		this.num = 0;
		this.next = null;
	}
	var	iflowHead = new InstrFlowHead();


	/**
	 * 数据初始化
	 */
	function initData() {
		var i, 
				j, 
				k;
    pageTable.length = 0;
    instrArray.length = 0;
		//虚页表初始化
		for(i = 0; i < Page.VM_PAGE; i++){
			pageTable.push(new VageItem(i, 0, 0, -1));
		}
		//物理页位图初始化
		for(i = 0; i < Page.PM_PAGE; i++){
			ppageBitmap[i] = null;			/*没有被使用*/
		}
		//指令数组初始化
    for(i = 0; i < Page.TOTAL_INSTR; i++){
      instrArray.push(new InstrItem(i, Math.floor(i / Page.INSTR_PER_PAGE), i % Page.INSTR_PER_PAGE, 0));
		}
		//指令流头初始化
		iflowHead.num = 0;
		iflowHead.next = null;
		
		pfailNum = 0 ;
	}

  /**
   * 按照规则生成指令流，一条指令可能在指令流中多次出现，
   * 因此，生成的指令流应大于等于TOTAL_INSTRUCTION
   * 返回生成的指令流中，指令总条数
   */
  function genInstrFlow() {
    //指令流中非重复指令个数
    var total = 0,
         s;

    s = Math.floor(Math.random() * Page.TOTAL_INSTR);
  
    total += addToFlow(s);
    //如果s不是最后一条，顺序执行下一条指令
    if(s < Page.TOTAL_INSTR - 1){
      total += addToFlow(s+1);
    }
    //重复：跳转到前地址部分、顺序执行、跳转到后地址部分、顺序执行
    while(total < Page.TOTAL_INSTR) {
      //如果s不是0，则跳转到前地址部分[0, s-1]，然后顺序执行
      if (s > 0) {
        s = Math.floor(Math.random() * s);
        total += addToFlow(s);
        //如果s不是最后一条，顺序执行下一条指令
        if (s < Page.TOTAL_INSTR - 1) {
          total += addToFlow(s+1);
        }
      }
      //如果s+1不是最后一条，则跳转到后地址部分[s+2, 319],然后顺序执行
      if(s < Page.TOTAL_INSTR - 2){
        //产生[s+2,320)的随机数
        s = Math.floor(Math.random() * (Page.TOTAL_INSTR - (s + 2))) + s + 2;
        total += addToFlow(s);
        //如果s不是最后一条，顺序执行下一条指令
        if(s < Page.TOTAL_INSTR - 1){
          total += addToFlow(s + 1);
        }
      }
    }

    //返回指令流中指令数
    return iflowHead.num;
  }

  /**
   * 将第n条指令加入到指令流链表尾部
   * 如该指令在指令流中不存在，返回1，否则返回0
   */
  function addToFlow(n) {
    var ret = 0;
    var tail = null;
    var ptr = null;

    //创建一个链表元素
    tail = new InstrFlow();
    tail.instr = instrArray[n];
    tail.next = null;

    //判断返回值，如指令流中已有该指令，返回值为0，否则返回1
      if(instrArray[n].inflow == 0){
        instrArray[n].inflow = 1;
        ret = 1;
      }
 

    //将指令加入链表，当指令流头为空时，直接加到指令流头后面
    //否则，将其加入到链表最后面
    if (iflowHead.num === 0 && iflowHead.next == null) {
      iflowHead.next = tail;
    } else {
      ptr = iflowHead.next;
      while(ptr.next != null) {
        ptr = ptr.next;
      }
      ptr.next = tail;
    }

    iflowHead.num += 1;

    return ret;
  }

  /**
   * 运行程序，在发生页面置换时，根据当前置换算法选择置换页面
   */
  function run() {
    var vpage,
        offset,
        ppage,
        chip,
        cur;
    chip = 0;
    // 指令流中当前指令
    cur = iflowHead.next;
    while(cur != null) {
      //首先判断该指令是否物理内存中
      vpage = cur.instr.vpage;
      offset = cur.instr.offset;
      //如果该指令不在物理内存中
      if (pageTable[vpage].exist == 0) {
        // 为其分配物理内存
        ppage = allocPPage(cur, chip);
        // 计算缺页率
        pfailNum += 1;
      } else {
        //如果已经在内存中，根据置换算法更新页表项中time信息
        //三种算法中，仅LRU需要更新
        switch(curReplaceAlg){
          case Page.LRU:
            pageTable[vpage].time = chip;
            break;
          case Page.OPT:
          case Page.FIFO:
          default:
            break;
        }
      }
      //打印该指令物理地址
      cur = cur.next;
      chip++;
    }
    return (pfailNum / iflowHead.num);
  }

  /**
   * 为当前指令分配物理页，返回物理页号，并更新页表及物理页表位图
   * @param  { Object } cur  [description]
   * @param  { number } chip [description]
   * @return {[type]}      [description]
   */
  function allocPPage(cur, chip) {
    var i,
        ppage,
        vpage;
    ppage = -1;
    vpage = cur.instr.vpage;
    //通过物理页表位图，寻找是否有未用的物理位图
    for(i = 0; i < Page.PM_PAGE; i++){
      if(ppageBitmap[i] == null){
        ppage = i;
        break;
      }
    }
    //如果没有直接可用的物理内存，需要置换
    if(ppage == -1) {
      switch (curReplaceAlg) {
        case Page.OPT:
          ppage = opt(cur);
          break;
        case Page.FIFO:
          ppage = fifo(cur);
          break;
        case Page.LRU:
          ppage = lru(cur);
          break;
        default:
          ppage = opt(cur);
          break;
      }
    }

    //更新页表中pmn以及exist，time属性根据置换算法类型修改
    pageTable[vpage].pmn = ppage;//对应的实页号
    pageTable[vpage].exist = 1;//存在位 置1
    switch (curReplaceAlg) {
      case Page.OPT:
        break;
      case Page.FIFO:
        //该页首次进入内存时才更新
        if(pageTable[vpage].time == -1){
          pageTable[vpage].time = chip;
        }
        break;
      case Page.LRU:
        pageTable[vpage].time = chip;
        break;
      default:
        break;
    }
    //更新物理位图中的信息
    if(ppageBitmap[ppage]){//更新被置换出去的页表信息
      ppageBitmap[ppage].exist = 0;
      ppageBitmap[ppage].time = -1;
    }
    //物理位图当前指针更新为新的页表项
    ppageBitmap[ppage] = pageTable[vpage];
    return ppage;
  }

  /**
   * 最优置换算法opt，寻找需要替换的页
   * @param  {Object} cur 
   * @return {[Number]}     
   */
  function opt(cur) {
    var found = 0,
        ppageHash = [],
        ptr = null,
        vpage,
        ppage,
        exist,
        i,
        ret;
    ppageHash = (new Array(Page.PM_PAGE + 1)).join(0).split('');
    ptr = cur.next;

    //搜索指令流，判断哪个在物理内存中的虚页最久才被使用
    while(ptr != null && found < Page.PM_PAGE - 1){
      vpage = ptr.instr.vpage;
      ppage = pageTable[vpage].pmn;
      exist = pageTable[vpage].exist;
      if(exist && ppageHash[ppage] == 0){
        ppageHash[ppage] = 1;
        found += 1;
      }
      ptr = ptr.next;
    }
    //搜索ppage_hash，第一个为0的物理页面，是需要被置换的
    for(i = 0; i < Page.PM_PAGE; i++){
      if(ppageHash[i] == 0){
        ret = i;
        break;
      }
    }
    return ret;
  } 

  /**
   * LRU置换算法，从ppage_bitmap中找time值最小的页面(最久未被使用)置换出去
   * @param  {Object} cur 
   * @return {[Number]} 
   */
  function lru(cur) {
    var minTime = 1000000,
        ppage = -1,
        i;
    for(i = 0; i < Page.PM_PAGE; i++) {
      if(ppageBitmap[i] && ppageBitmap[i].time < minTime){
        minTime = ppageBitmap[i].time;
        ppage = i;
      }
    }
    return ppage;
  }
  /**
   * fifo置换算法，从ppage_bitmap中找time值最小的页面（最早到来）置换出去
   * @param  {Object} cur 
   * @return {[Number]} 
   */
  function fifo(cur) {
    var minTime = 1000000,
        ppage = -1,
        i;
    for(i = 0; i < Page.PM_PAGE; i++) {
      if(ppageBitmap[i] && ppageBitmap[i].time < minTime){
        minTime = ppageBitmap[i].time;
        ppage = i;
      }
    }
    return ppage;
  }

  /**
   * 释放指令流数据结构
   */
  function clean() {
    ptr = null;
    cur = null;

    ptr = iflowHead.next;
    cur = iflowHead.next;

    while(ptr != null) {
      cur = ptr;
      ptr = ptr.next;
      cur = null;
    }

  }

  /**
   * 重置页表信息，当使用一种算法模拟后，如再使用第二种算法模拟，
   * 需重置页表，但保留指令流初始化信息，这样，多种算法可以使用
   * 一个指令流来进行比较
   */
  function resetPageTable() {
    var i = 0,
        j = 0;

    // 虚页表初始化
    pageTable.length = 0;
    for(i = 0; i < Page.VM_PAGE; i++){
      pageTable.push(new VageItem(i, 0, 0, -1));
    }

    //物理页位图初始化
    for(i = 0; i < Page.PM_PAGE; i++){
      ppageBitmap[i] = null;//没有被使用
    }
    pfailNum = 0;
  }

  /**
   * 打印
   * @param  {Number} num  
   * @param  {Number} num1 
   * @param  {Number} num2 
   * @param  {Number} num3 
   */
  function printMsg(num, num1, num2, num3) {
    var Msg = '<tr> <th scope="row">'+ num +'</th> <td>'+ num1 +'</td> <td>'+ num2 +'</td> <td>'+ num3 +'</td> <td>'+ Page.PM_PAGE +'</td> <td>'+ Page.VM_PAGE +'</td> <td>'+ Page.INSTR_PER_PAGE +'</td> <td>'+ Page.TOTAL_INSTR +'</td> </tr>';
    $('#PageMsg').append(Msg);
  }


  var num = 1,
      num1,
      num2,
      num3;

  $('#addProcess').click(function(event) {
    Page.VM_PAGE = +$('#vmPage').val();
    Page.PM_PAGE = +$('#pmPage').val();
    Page.TOTAL_INSTR = +$('#totalInstr').val();
    Page.INSTR_PER_PAGE = +$('#instrPerPage').val();
    //初始化数据
  	initData();
    //产生指令流

    genInstrFlow();
    curReplaceAlg = Page.OPT;
    resetPageTable();
    num1 = run().toFixed(11);
    curReplaceAlg = Page.FIFO;
    resetPageTable();
    num2 = run().toFixed(11);
    curReplaceAlg = Page.LRU;
    resetPageTable();
    num3 = run().toFixed(11);
    printMsg(num++, num1, num2, num3);
    clean();

  });


});